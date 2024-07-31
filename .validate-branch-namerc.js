module.exports = {
    pattern: '^([0-9]+-|release/)?([a-zA-Z0-9.]+-)*([a-zA-Z0-9.?]+)$',
    errorMsg:
        'The branch name is not valid.\nBranch names must be either:\n1234-foo-bar-baz (with 1234 being a gitlab issue number),\nor just foo-bar-baz if there is no issue number,\nrelease-v1.2.3 for release branches,\nrelease/0.38 for long term release branches\n\n',
};
