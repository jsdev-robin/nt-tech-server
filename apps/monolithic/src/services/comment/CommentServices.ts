import { ARCHIVE_TTL_DAYS, Status } from '@server/constants';
import { addDays } from 'date-fns';
import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import createError from 'http-errors';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import { QueryAggregate } from 'mongoose-query-find';
import z from 'zod';
import { CommentModel } from '../../models/comment/CommentModel';
import {
  type CreateRequest,
  type FindBulkRequest,
  type FindOneRequest,
  type UpdateRequest,
} from './types';

export class CommentServices {
  static create: RequestHandler = async (
    req: CreateRequest,
    res: Response,
  ): Promise<void> => {
    const document = await CommentModel.create({
      ...req.body,
      author: req.self._id,
      linkedTo: req.self._id,
    });

    res.status(StatusCodes.CREATED).json({
      status: ReasonPhrases.CREATED,
      message: 'Comment created successfully',
      payload: {
        data: document,
      },
    });
  };

  static update: RequestHandler = async (
    req: UpdateRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const document = await CommentModel.findOneAndUpdate(
      {
        _id: String(req.params.id),
        linkedTo: req.self._id,
        recordStatus: { $nin: [Status.ARCHIVED, Status.DELETED] },
      },
      { $set: req.body },
      { returnDocument: 'after', runValidators: true },
    );

    if (!document) {
      return next(createError(StatusCodes.NOT_FOUND, 'Comment not found'));
    }

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Comment updated successfully',
      payload: {
        data: document,
      },
    });
  };

  static find: RequestHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const timezone = req.headers['x-timezone'] as string;

    const documents = await new QueryAggregate(CommentModel, req.query, {
      timezone,
    })
      .allowFields([
        '_id',
        'ticket',
        'author',
        'message',
        'isInternal',
        'recordStatus',
        'createdAt',
        'updatedAt',
      ])
      .objectIdFields(['ticket', 'author', '_id'])
      .where({
        linkedTo: new Types.ObjectId(req.self._id),
        recordStatus: { $ne: Status.DELETED },
      })
      .filter()
      .globalSearch(['message'])
      .addStage({ $sort: { createdAt: -1 } })
      .sort()
      .project()
      .paginate();

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Comments fetched successfully',
      payload: documents,
    });
  };

  static findOne: RequestHandler = async (
    req: FindOneRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const document = await CommentModel.findOne({
      _id: req.params.id,
      linkedTo: req.self._id,
      recordStatus: { $nin: [Status.ARCHIVED, Status.DELETED] },
    });

    if (!document) {
      return next(createError(StatusCodes.NOT_FOUND, 'Comment not found'));
    }

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Comment fetched successfully',
      payload: {
        data: document,
      },
    });
  };

  static archived: RequestHandler = async (
    req: FindOneRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const document = await CommentModel.findOneAndUpdate(
      {
        _id: req.params.id,
        linkedTo: req.self._id,
        recordStatus: { $nin: [Status.ARCHIVED, Status.DELETED] },
      },
      {
        $set: {
          recordStatus: Status.ARCHIVED,
        },
      },
      { returnDocument: 'after' },
    );

    if (!document) {
      return next(createError(StatusCodes.NOT_FOUND, 'Comment not found'));
    }

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Comment archived successfully',
      payload: {
        data: document,
      },
    });
  };

  static restore: RequestHandler = async (
    req: FindOneRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const document = await CommentModel.findOneAndUpdate(
      {
        _id: req.params.id,
        linkedTo: req.self._id,
        recordStatus: Status.ARCHIVED,
      },
      {
        $set: { recordStatus: Status.ACTIVE },
      },
      { returnDocument: 'after' },
    );

    if (!document) {
      return next(
        createError(StatusCodes.NOT_FOUND, 'Archived comment not found'),
      );
    }

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Comment restored successfully',
      payload: {
        data: document,
      },
    });
  };

  static delete: RequestHandler = async (
    req: FindOneRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const document = await CommentModel.findOneAndUpdate(
      {
        _id: req.params.id,
        linkedTo: req.self._id,
        recordStatus: Status.ARCHIVED,
      },
      {
        $set: {
          recordStatus: Status.DELETED,
          expiresAt: addDays(new Date(), ARCHIVE_TTL_DAYS),
        },
      },
      { returnDocument: 'after' },
    );

    if (!document) {
      return next(
        createError(StatusCodes.NOT_FOUND, 'Archived comment not found'),
      );
    }

    res.status(StatusCodes.NO_CONTENT).send();
  };

  static bulkArchived: RequestHandler = async (
    req: FindBulkRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { ids } = req.body;

    const result = await CommentModel.updateMany(
      {
        _id: { $in: ids },
        linkedTo: req.self._id,
        recordStatus: { $nin: [Status.ARCHIVED, Status.DELETED] },
      },
      {
        $set: { recordStatus: Status.ARCHIVED },
      },
    );

    if (result.modifiedCount === 0) {
      return next(createError(StatusCodes.NOT_FOUND, 'Comments not found'));
    }

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: `${result.modifiedCount} comments archived`,
      payload: {
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          ids: ids,
        },
      },
    });
  };

  static bulkRestore: RequestHandler = async (
    req: FindBulkRequest,
    res: Response,
  ): Promise<void> => {
    const { ids } = req.body;

    const result = await CommentModel.updateMany(
      {
        _id: { $in: ids },
        linkedTo: req.self._id,
        recordStatus: Status.ARCHIVED,
      },
      {
        $set: { recordStatus: Status.ACTIVE },
      },
    );

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: `${result.modifiedCount} comments restored`,
      payload: {
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          ids: ids,
        },
      },
    });
  };

  static bulkDelete: RequestHandler = async (
    req: FindBulkRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { ids } = req.body;

    const result = await CommentModel.updateMany(
      {
        _id: { $in: ids },
        linkedTo: req.self._id,
        recordStatus: Status.ARCHIVED,
      },
      {
        $set: {
          recordStatus: Status.DELETED,
          expiresAt: addDays(new Date(), ARCHIVE_TTL_DAYS),
        },
      },
    );

    if (result.modifiedCount === 0) {
      return next(
        createError(StatusCodes.NOT_FOUND, 'Archived comments not found'),
      );
    }

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: `${result.modifiedCount} comments deleted`,
      payload: {
        data: {
          deletedCount: result.modifiedCount,
          ids: ids,
        },
      },
    });
  };

  static count: RequestHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const status = z
      .enum(Status)
      .exclude(['DELETED'])
      .optional()
      .parse(req.query.status);

    const total = await CommentModel.countDocuments({
      linkedTo: req.self._id,
      recordStatus: status ?? { $ne: Status.DELETED },
    });

    res.status(StatusCodes.OK).json({
      status: ReasonPhrases.OK,
      message: 'Comments count fetched successfully',
      payload: {
        data: {
          total,
        },
      },
    });
  };
}
