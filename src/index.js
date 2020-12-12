import visit from 'unist-util-visit';

import { defaultTransformers } from './transformers';

const getUrlString = (url) => {
  const urlString = url.startsWith('http') ? url : `https://${url}`;

  try {
    return new URL(urlString).toString();
  } catch (error) {
    return null;
  }
};

const defaultCache = new Map();

async function remarkEmbedderBase({
  cache = defaultCache,
  markdownAST,
  customTransformers = [],
  services = {},
}) {
  const transformers = [...defaultTransformers, ...customTransformers];

  const transformations = [];
  visit(markdownAST, 'paragraph', (paragraphNode) => {
    if (paragraphNode.children.length !== 1) {
      return;
    }

    const [node] = paragraphNode.children;
    const isText = node.type === 'text';
    // it's a valid link if there's no title, and the value is the same as the URL
    const isValidLink =
      node.type === 'link' &&
      node.title === null &&
      node.children.length === 1 &&
      node.children[0].value === node.url;
    if (!isText && !isValidLink) {
      return;
    }

    const { url, value = url } = node;

    const urlString = getUrlString(value);
    if (!urlString) {
      return;
    }

    transformers
      .filter(({ shouldTransform }) => shouldTransform(urlString))
      .forEach(({ getHTML, name = '' }) => {
        transformations.push(async () => {
          try {
            let html = await cache.get(urlString);

            if (!html) {
              html = await getHTML(urlString, services[name] || {});
              await cache.set(urlString, html);
            }

            node.type = `html`;
            node.value = html;
            node.children = undefined;
          } catch (error) {
            error.message = `The following error appeared while processing '${urlString}':\n\n${error.message}`;

            throw error;
          }
        });
      });
  });

  await Promise.all(transformations.map((t) => t()));

  return markdownAST;
}

function remarkEmbedder(options) {
  return (tree) => remarkEmbedderBase({ markdownAST: tree, ...options });
}

function remarkEmbedderGatsby({ cache, markdownAST }, options) {
  return remarkEmbedderBase({ cache, markdownAST, ...options });
}

export { remarkEmbedder, remarkEmbedderGatsby };

// TODO: remove this. Will be a breaking change though...
// would be best to rename the package and remove the default export
export default remarkEmbedderGatsby;
