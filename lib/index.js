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
      'document:afterMGet': 'filterMgetResult'
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
   * Check is the user is allowed to update/replace/delete a document
   * Will fetch the document beeing updated,
   * and then deny the request if the author is not current user.
   *
   * @param {Request} request The request that triggered the event
   * @param {Function} callback The callback that bears the result of the
   *                            function. Signature: `callback(error, request)`
   */
  assertCanUpdate (request, callback) {
    const getRequest = new this.context.constructors.Request({
      controller: 'document',
      action: 'get',
      index: request.input.resource.index,
      collection: request.input.resource.collection,
      _id: request.input.resource._id
    });

    this.context.accessors.execute(getRequest)
      .then(res => {
        if (res.result._meta.author !== request.context.user._id) {
          return this._denyRequest(request, callback);
        }
        callback(null, request);
      })
      .catch(err => {
        if (err.status === 404) {
          return callback(null, request);
        }
        callback(err, request);
      });
  }

  /**
   * Inject an additional filter to search/count/deleteByQuery requests:
   *  filter only documents which author is current user.
   *
   * @param {Request} request The request that triggered the event
   * @param {Function} callback The callback that bears the result of the
   *                            function. Signature: `callback(error, request)`
   */
  addQueryFilter (request, callback) {
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
   * Deny the request if current user is not the author of the document.
   *
   * @param {Request} request The request that triggered the event
   * @param {Function} callback The callback that bears the result of the
   *                            function. Signature: `callback(error, request)`
   */
  assertCanRead (request, callback) {
    if (request.result._meta.author !== request.context.user._id) {
      return this._denyRequest(request, callback);
    }
    callback(null, request);
  }

  /**
   * Filter a mget results
   * Keep only documents which author is the current user
   *
   * @param {Request} request The request that triggered the event
   * @param {Function} callback The callback that bears the result of the
   *                            function. Signature: `callback(error, request)`
   */
  filterMgetResult (request, callback) {
    const hits = [];
    for (const hit of request.result.hits) {
      if (hit.found && hit._meta.author === request.context.user._id) {
        hits.push(hit);
      } else {
        hits.push({
          _index: hit._index,
          _type: hit._type,
          _id: hit._id,
          found: false
        });
      }
    }
    request.result.hits = hits;
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
