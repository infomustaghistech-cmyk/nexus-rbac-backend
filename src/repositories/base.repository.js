'use strict';

/**
 * Data-access layer. The ONLY place that talks to Mongoose.
 * Services depend on repositories, never on models directly, so the storage
 * engine could be swapped (or mocked) without touching business logic.
 *
 * Tenant-scoped methods always include `organization` in the filter, so one
 * tenant can never read or modify another tenant's data by guessing an id.
 * Reads use .lean() to return plain objects (much faster, less memory).
 */
class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  async create(data, { session } = {}) {
    if (session) {
      const [doc] = await this.model.create([data], { session });
      return doc.toObject();
    }
    const doc = await this.model.create(data);
    return doc.toObject();
  }

  findOne(filter, { select, populate, session } = {}) {
    let q = this.model.findOne(filter);
    if (select) q = q.select(select);
    if (populate) q = q.populate(populate);
    if (session) q = q.session(session);
    return q.lean().exec();
  }

  findById(id, options) {
    return this.findOne({ _id: id }, options);
  }

  findInOrg(orgId, id, options) {
    return this.findOne({ _id: id, organization: orgId }, options);
  }

  find(filter, { select, sort, skip, limit, populate, session } = {}) {
    let q = this.model.find(filter);
    if (select) q = q.select(select);
    if (sort) q = q.sort(sort);
    if (skip) q = q.skip(skip);
    if (limit) q = q.limit(limit);
    if (populate) q = q.populate(populate);
    if (session) q = q.session(session);
    return q.lean().exec();
  }

  count(filter, { session } = {}) {
    let q = this.model.countDocuments(filter);
    if (session) q = q.session(session);
    return q.exec();
  }

  /** Returns the updated document, or null when the filter matched nothing. */
  findOneAndUpdate(filter, update, { populate, session } = {}) {
    let q = this.model.findOneAndUpdate(filter, update, { returnDocument: 'after', runValidators: true });
    if (populate) q = q.populate(populate);
    if (session) q = q.session(session);
    return q.lean().exec();
  }

  updateInOrg(orgId, id, update, options) {
    return this.findOneAndUpdate({ _id: id, organization: orgId }, update, options);
  }

  updateOne(filter, update, { session } = {}) {
    return this.model.updateOne(filter, update, { runValidators: true, session }).exec();
  }

  updateMany(filter, update, { session } = {}) {
    return this.model.updateMany(filter, update, { session }).exec();
  }

  async deleteInOrg(orgId, id, { session } = {}) {
    const res = await this.model.deleteOne({ _id: id, organization: orgId }, { session }).exec();
    return res.deletedCount > 0;
  }

  deleteMany(filter, { session } = {}) {
    return this.model.deleteMany(filter, { session }).exec();
  }
}

module.exports = BaseRepository;
