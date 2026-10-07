'use strict';

const BaseRepository = require('./base.repository');
const { Organization, Role, User, Project, Task, RefreshToken } = require('../models');
const { LIMITS } = require('../constants/enums');

class UserRepository extends BaseRepository {
  findByEmailWithPassword(email) {
    return this.model.findOne({ email: email.toLowerCase() }).select('+password').lean().exec();
  }
}

class RoleRepository extends BaseRepository {
  /** System roles plus the organization's own custom roles. */
  findAvailableForOrg(orgId) {
    return this.find({ $or: [{ organization: null }, { organization: orgId }] }, { sort: { isSystem: -1, name: 1 } });
  }

  findSystemRoleByName(name) {
    return this.findOne({ organization: null, name });
  }
}

class ProjectRepository extends BaseRepository {
  /** Atomic counter update: safe under concurrent writes, no read-modify-write race. */
  incrementTaskStats(orgId, projectId, { total = 0, done = 0 }) {
    return this.model
      .updateOne({ _id: projectId, organization: orgId }, { $inc: { 'taskStats.total': total, 'taskStats.done': done } })
      .exec();
  }

  /**
   * Single atomic write that also enforces two invariants in the filter:
   * the user is not already a member, and the array is below its size cap
   * (`members.<max-1>` must not exist). No read-modify-write race is possible.
   */
  addMember(orgId, projectId, member) {
    return this.model
      .findOneAndUpdate(
        {
          _id: projectId,
          organization: orgId,
          'members.user': { $ne: member.user },
          [`members.${LIMITS.MAX_PROJECT_MEMBERS - 1}`]: { $exists: false },
        },
        { $push: { members: member } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();
  }

  removeMember(orgId, projectId, userId) {
    return this.model
      .findOneAndUpdate(
        { _id: projectId, organization: orgId },
        { $pull: { members: { user: userId } } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();
  }
}

class RefreshTokenRepository extends BaseRepository {
  revokeFamily(family) {
    return this.updateMany({ family, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }

  revokeAllForUser(userId) {
    return this.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }
}

module.exports = {
  organizationRepository: new BaseRepository(Organization),
  roleRepository: new RoleRepository(Role),
  userRepository: new UserRepository(User),
  projectRepository: new ProjectRepository(Project),
  taskRepository: new BaseRepository(Task),
  refreshTokenRepository: new RefreshTokenRepository(RefreshToken),
};
