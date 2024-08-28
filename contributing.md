# Contributing

Thanks for your interest in contributing to `jsdoc-plugin-typescript` development.  The development environment requires [Node](https://nodejs.org/en/download/package-manager) (the latest LTS release should work) and makes use of `npm` for running tasks (this comes with Node, no separate install required).

After cloning the repository, you can install all dependencies with `npm`:

```bash
# install dependencies
npm install
```

## Tests

After making changes, add tests to cover any new functionality or bug fixes.  Then run the tests:

```bash
# run the tests
npm test
```

## Lint

Style guidelines for the code are configured as ESLint rules and enforced by running the `lint` task:

```bash
# run the linter
npm run lint
```

(Note that the `lint` task is also run when you run the tests.)

The linter and its configuration are installed when you install the project dependencies (with `npm install`).  You don't need to have ESLint (or Prettier or anything else) installed globally.  If you want to have your editor configured to notify you of lint issues or fix them for you, see the [ESLint documentation](https://eslint.org/docs/latest/use/integrations) on editor integrations.  Make sure your editor is configured to make use of the ESLint version and configuration installed as dependencies for this project (instead of some globally installed version or configuration you may have elsewhere).

You can try to auto-fix any lint related issues with this command:

```bash
# update syntax to conform with the project guidelines
npm run lint -- --fix
```

## Pull Requests

After making changes and testing them locally, create [a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests) with the branch that contains your contributions.

Before your pull request can be merged, a CI job will run the tests and the linter.
