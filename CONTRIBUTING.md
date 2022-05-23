Thanks for helping the giro3d project!

There are various ways of contributing to the project:

* [getting started contributing](#getting-started-contributing)
* [submitting an issue](#submitting-an-issue),
* [opening a pull request](#opening-a-pull-request)

## Getting Started Contributing

Everyone is welcome to contribute to giro3d!

In addition to contributing to core giro3d code, we appreciate many types of contributions:

* Being active on issues, MR and other communication channel.
* Showcasing your application built with giro3d : submit an issue with a link to your demo on the project issue tracker.
* Writing tutorials, creating examples, and improving the reference documentation.
* Submitting issues as [described below](#submitting-an-issue)
* Triaging issues. Browse the [issues](https://gitlab.com/giro3d/giro3d/-/issues) and comment on issues that are no longer reproducible or on issues for which you have additional information

## Submitting an Issue

If you think you've found a bug in giro3d, first search the [giro3d issues](https://gitlab.com/giro3d/giro3d/-/issues). If an issue already exists, you can add a comment with any additional information. Use reactions (not comments) to express your interest. This helps prioritize issues.

If a related issue does not exist, submit a new one. Please include as much of the following information as is relevant:
* Sample data to reproduce the issue
* Screenshot, video or animated .gif if appropriate. Screenshots are particularly useful for exceptions and rendering artifacts. If it is a rendering artifact, also include the output of [webglreport.com](http://webglreport.com/) for the computer you have the problem on
* Your operating system and version, browser and version, and video card.  Are they all up-to-date? Is the issue specific to one of them?
* The exact version of giro3d. Did this work in a previous version?
* Ideas for how to fix or workaround the issue. Also mention if you are willing to help fix it. If so, the giro3d team can often provide guidance and the issue may get fixed more quickly with your help


## Opening a Pull Request

We welcome pull requests with great interest. We try to promptly review them, provide feedback, and merge. Following the tips in this guide will help your pull request be merged quickly.

If you plan to make a major change, please open an issue first.

### Pull Request Guidelines

Code quality matters. Here are some advices to read before submitting a Pull Request.

* If this is your first contribution to giro3d, add your name to [CONTRIBUTORS.md](CONTRIBUTORS.md)
* If your pull request fixes an existing issue, include a link to the issue in the description.
* If your pull request needs additional work, include a task list, or better, split it in several PR
* Ping @giro3d to get your code reviewed, and also when you are done making new commits to address feedback
* Verify your code passes the linter and tests (`npm run test`).
* If you added new identifiers to the giro3d API:
   * Include reference documentation with code examples
   * If your change adds significant features, provide a demo
* Write meaningful commit messages
* Keep the git history clean, rebase your work when necessary
* Delete unused and obsolete branches
