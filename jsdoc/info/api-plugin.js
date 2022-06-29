/**
 * Handle the api annotation.
 * @param {object} dictionary The tag dictionary.
 */
exports.defineTags = function (dictionary) {
  dictionary.defineTag('api', {
    onTagged: function (doclet, tag) {
      doclet.api = true;
    },
  });
};
