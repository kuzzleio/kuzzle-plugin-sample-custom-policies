# Sample "custom policies" plugin for Kuzzle

This plugin demonstrates how we can use custom code to manage custom permissions.

## How it works

Let's assume that we have an application in which we do not want to allow non-admin users to view, update or delete other user's items.

### Update/delete queries

Run [assertCanUpdate](lib/index.js#L38) **before** the request:
* fetch the document we want to update or delete, to check its metadata
* allow the request if the author of the document is current user
* deny the request otherwise

### search/count queries

Run [addQueryFilter](lib/index.js#L81) **before** the request:
* inject a filter to the elasticsearch query to filter document owned by current user.

### get query

Run [assertCanRead](lib/index.js#L121) **after** the request:
* check the metadata of the document given by the request's response
* allow the request and send back the response if the author of the document is current user
* deny the request and send back an `ForbiddenError` response otherwise

### mget query

Run [filterMgetResult](lib/index.js#L141) **after** the request:
* iterate through the response results
* keep only the documents which author is current user.

## Install

Clone this repository locally and make it accessible from the `plugins/enabled` directory relative to the Kuzzle installation directory. A common practice is to put the code of the plugin in `plugins/available` and create a symbolic link to it in `plugins/enabled`.

**Note.** If you are running Kuzzle within a Docker container, you will need to mount the local plugin installation directory as a volume in the container.

Please refer to the Guide for further instructions on [how to install Kuzzle plugins](https://docs.kuzzle.io/guide/essentials/plugins/#how-to-install-plugin).

