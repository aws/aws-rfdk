# Github Actions and Integration

This directory is used to hold all templates and github actions that are integrated into the RFDK Github Repository.

## Pull Request Template

This template currently only adds an affirmitive consent line to ensure that anyone who creates a pull request agrees with the Apache 2.0 License

## Issue Templates

We currently have the following 4 Issue Templates:

* Bug
* Doc
* Feature Request
* General Issue

These all prepopulate the issue with questions to help get the information needed to assist with the issue.  They also add the initial labels to the issue so they will be easily sortable.

## Workflows

This folder contains the Github Actions that we have installed on the Git Repository.

### Labeler

This workflow is used to maintain the labels that are configured on the Git hub repository.

It works by reading the file .github/config/labels.yml and updating the labels in repository so they match the labels described in that file.  This include updating existing labels, adding new labels, and removing all labels that do not exist in that file.

This workflow is triggered whenever a change is pushed to the .github/config/labels.yml file in the mainline branch.
