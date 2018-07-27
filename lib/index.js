/**
 * Sample plugin to demonstrate how we can add advanced custom policies on Kuzzle actions
 *
 *
 * @see http://docs.kuzzle.io/plugins-reference for more info about Kuzzle plugins
 * @see https://github.com/kuzzleio/kuzzle-core-plugin-boilerplate for full plugin sample
 */
class MyPoliciesPlugin {
  constructor () {
    this.context = null;
    this.config = {};

    this.pipes = {
      'document:beforeCount': 'addQueryFilter',
      'document:beforeSearch': 'addQueryFilter',
      'document:beforeCreateOrReplace': 'assertCanUpdate',
      'document:beforeReplace': 'assertCanUpdate',
      'document:beforeUpdate': 'assertCanUpdate',
      'document:beforeDelete': 'assertCanUpdate',
      'document:beforeDeleteByQuery': 'addQueryFilter',
      'document:afterGet': 'assertCanRead',
      'document:afterMGet': 'filterMgetResult',/*,
      'realtime:beforeSubscribe': 'addSubscriptionFilter' */
    };
  }

  /**
   * Initializes the plugin with configuration and context.
   *
   * @param {Object} customConfig The custom configuration passed to the plugin
   *                               via the Kuzzle configuration overriding the defaultConfig.
   * @param {Object} context A restricted gateway to the Kuzzle API
   */
  init (customConfig, context) {
    this.config = Object.assign(this.config, customConfig);
    this.context = context;
  }

  /**
   * Inject an additional filter to subscribe requests:
   *
   * @param {Request} request The request that triggered the event
   * @param {Function} callback The callback that bears the result of the
   *                            function. Signature: `callback(error, request)`
   */
  addSubscriptionFilter (request, callback) {
    // Do not filter results for admin users
    if (request.context.user.profileIds.indexOf('admin') !== -1) {
      return callback(null, request);
    }

    // Add a filter on the document author
    const subscriptionFilter = {
      and: [
        { equals: { "_kuzzle_info.author": request.context.user._id } }
      ]
    };

    // If there is an existent filter, add it to our filter
    if (Object.keys(request.input.body).length > 0) {
      subscriptionFilter.and.push(Object.values(request.input.body)[0]);
    }

    // Replace the subscription filter
    request.input.body = subscriptionFilter;

    callback(null, request);
  }

  /**
   * Check is the user is allowed to update/replace/delete a document
   * Will fetch the document beeing updated,
   * and then deny the request if the author is not current user.
   *
   * @param {Request} request The request that triggered the event
   * @param {Function} callback The callback that bears the result of the
   *                            function. Signature: `callback(error, request)`
   */
  assertCanUpdate (request, callback) {
    // Do not filter results for admin users
    if (request.context.user.profileIds.indexOf('admin') !== -1) {
      return callback(null, request);
    }

    // Fetch the document
    const getRequest = new this.context.constructors.Request({
      controller: 'document',
      action: 'get',
      index: request.input.resource.index,
      collection: request.input.resource.collection,
      _id: request.input.resource._id
    });

    this.context.accessors.execute(getRequest)
      .then(res => {
        // Deny the request if current user is not the author of the document
        if (res.result._source._kuzzle_info.author !== request.context.user._id) {
          return this._denyRequest(request, callback);
        }
        callback(null, request);
      })
      .catch(err => {
        // If the document is not found, we allow the request (for createOrReplace)
        if (err.status === 404) {
          return callback(null, request);
        }

        // throw other error types
        callback(err, request);
      });
  }

  /**
   * Inject an additional filter to search/count/deleteByQuery requests:
   *
   * @param {Request} request The request that triggered the event
   * @param {Function} callback The callback that bears the result of the
   *                            function. Signature: `callback(error, request)`
   */
  addQueryFilter (request, callback) {
    // Do not filter results for admin users
    if (request.context.user.profileIds.indexOf('admin') !== -1) {
      return callback(null, request);
    }

    // Inject ES query filter to fetch only documents which author is current user
    const
      queryObject = {
        bool: {
          filter: {
            bool: {
              must: {
                term: {
                  '_kuzzle_info.author': request.context.user._id
                }
              }
            }
          }
        }
      };

    if (request.input.body) {
      request.input.body = {};
    }
    if (request.input.body.query) {
      queryObject.bool.must = request.input.body.query;
    }
    request.input.body.query = queryObject;

    callback(null, request);
  }

  /**
   * Check is the user is allowed to do read a document
   *
   * @param {Request} request The request that triggered the event
   * @param {Function} callback The callback that bears the result of the
   *                            function. Signature: `callback(error, request)`
   */
  assertCanRead (request, callback) {
    // Do not filter results for admin users
    if (request.context.user.profileIds.indexOf('admin') !== -1) {
      return callback(null, request);
    }

    // Deny the request if current user is not the author of the document
    if (request.result._source._kuzzle_info.author !== request.context.user._id) {
      return this._denyRequest(request, callback);
    }
    callback(null, request);
  }

  /**
   * Filter a mget results
   *
   * @param {Request} request The request that triggered the event
   * @param {Function} callback The callback that bears the result of the
   *                            function. Signature: `callback(error, request)`
   */
  filterMgetResult (request, callback) {
    // Do not filter results for admin users
    if (request.context.user.profileIds.indexOf('admin') !== -1) {
      return callback(null, request);
    }

    request.result.hits = request.result.hits.filter(hit => hit._source._kuzzle_info.author === request.context.user._id);

    callback(null, request);
  }

  /**
   * @private Deny the request
   */
  _denyRequest (request, callback) {
    if (request.context.user._id === '-1') {
      callback(new this.context.errors.UnauthorizedError(`Unauthorized action [${request.input.resource.index}/${request.input.resource.collection}/${request.input.controller}/${request.input.action}] for anonymous user`), request);
    } else {
      callback(new this.context.errors.ForbiddenError(`Forbidden action [${request.input.resource.index}/${request.input.resource.collection}/${request.input.controller}/${request.input.action}] for user ${request.context.user._id}`), request);
    }
  }
}

module.exports = MyPoliciesPlugin;
