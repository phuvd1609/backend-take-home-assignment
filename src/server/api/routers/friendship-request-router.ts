import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { FriendshipStatusSchema } from '@/utils/server/friendship-schemas'
import { authGuard } from '@/server/trpc/middlewares/auth-guard'
import { procedure } from '@/server/trpc/procedures'
import { IdSchema } from '@/utils/server/base-schemas'
import { router } from '@/server/trpc/router'

const SendFriendshipRequestInputSchema = z.object({
  friendUserId: IdSchema,
})

const canSendFriendshipRequest = authGuard.unstable_pipe(
  async ({ ctx, rawInput, next }) => {
    const { friendUserId } = SendFriendshipRequestInputSchema.parse(rawInput)

    await ctx.db
      .selectFrom('users')
      .where('users.id', '=', friendUserId)
      .select('id')
      .limit(1)
      .executeTakeFirstOrThrow(
        () =>
          new TRPCError({
            code: 'BAD_REQUEST',
          })
      )

    return next({ ctx })
  }
)

const AnswerFriendshipRequestInputSchema = z.object({
  friendUserId: IdSchema,
})

const canAnswerFriendshipRequest = authGuard.unstable_pipe(
  async ({ ctx, rawInput, next }) => {
    const { friendUserId } = AnswerFriendshipRequestInputSchema.parse(rawInput)

    await ctx.db
      .selectFrom('friendships')
      .where('friendships.userId', '=', friendUserId)
      .where('friendships.friendUserId', '=', ctx.session.userId)
      .where(
        'friendships.status',
        '=',
        FriendshipStatusSchema.Values['requested']
      )
      .select('friendships.id')
      .limit(1)
      .executeTakeFirstOrThrow(() => {
        throw new TRPCError({
          code: 'BAD_REQUEST',
        })
      })

    return next({ ctx })
  }
)

export const friendshipRequestRouter = router({
  send: procedure
    .use(canSendFriendshipRequest)
    .input(SendFriendshipRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      /**
       * Question 3: Fix bug
       *
       * Fix a bug where our users could not send a friendship request after
       * they'd previously been declined. Steps to reproduce:
       *  1. User A sends a friendship request to User B
       *  2. User B declines the friendship request
       *  3. User A tries to send another friendship request to User B -> ERROR
       *
       * Instructions:
       *  - Go to src/server/tests/friendship-request.test.ts, enable the test
       * scenario for Question 3
       *  - Run `yarn test` to verify your answer
       */

      const alreadyRejected = await ctx.db
        .selectFrom('friendships')
        .where('friendships.userId', '=', ctx.session.userId)
        .where('friendships.friendUserId', '=', input.friendUserId)
        .where(
          'friendships.status',
          '=',
          FriendshipStatusSchema.Values['declined']
        )
        .selectAll()
        .execute()

      if (alreadyRejected.length > 0) {
        await ctx.db
          .updateTable('friendships')
          .set({
            status: FriendshipStatusSchema.Values['requested'],
          })
          .where('friendships.userId', '=', ctx.session.userId)
          .where('friendships.friendUserId', '=', input.friendUserId)
          .execute()
      } else {
        await ctx.db
          .insertInto('friendships')
          .values({
            userId: ctx.session.userId,
            friendUserId: input.friendUserId,
            status: FriendshipStatusSchema.Values['requested'],
          })
          .execute()
        return;
      }
    }),

  accept: procedure
    .use(canAnswerFriendshipRequest)
    .input(AnswerFriendshipRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction().execute(async (t) => {
        // Update the current friendship request to accepted status
        await t
          .updateTable('friendships')
          .set({
            status: FriendshipStatusSchema.Values['accepted'],
          })
          .where('friendships.userId', '=', input.friendUserId)
          .where('friendships.friendUserId', '=', ctx.session.userId)
          .execute()

        // Check if the opposite friendship already exists
        const existingFriendship = await t
          .selectFrom('friendships')
          .where('friendships.userId', '=', ctx.session.userId)
          .where('friendships.friendUserId', '=', input.friendUserId)
          .selectAll()
          .execute()

        if (existingFriendship.length > 0) {
          // Friendship already exists, so only update
          await t
            .updateTable('friendships')
            .set({
              status: FriendshipStatusSchema.Values['accepted'],
            })
            .where('friendships.userId', '=', ctx.session.userId)
            .where('friendships.friendUserId', '=', input.friendUserId)
            .execute()
        } else {
          // Create a new friendship request with the opposite user as the friend
          await t
            .insertInto('friendships')
            .values({
              userId: ctx.session.userId,
              friendUserId: input.friendUserId,
              status: FriendshipStatusSchema.Values['accepted'],
            })
            .execute()
        }
        /**
         * Question 1: Implement api to accept a friendship request
         *
         * When a user accepts a friendship request, we need to:
         *  1. Update the friendship request to have status `accepted`
         *  2. Create a new friendship request record with the opposite user as the friend
         *
         * The end result that we want will look something like this
         *
         *  | userId | friendUserId | status   |
         *  | ------ | ------------ | -------- |
         *  | 1      | 2            | accepted |
         *  | 2      | 1            | accepted |
         *
         * Instructions:
         *  - Your answer must be inside this transaction code block
         *  - Run `yarn test` to verify your answer
         *
         * Documentation references:
         *  - https://kysely-org.github.io/kysely/classes/Transaction.html#transaction
         *  - https://kysely-org.github.io/kysely/classes/Kysely.html#insertInto
         *  - https://kysely-org.github.io/kysely/classes/Kysely.html#updateTable
         */
      })
    }),

  decline: procedure
    .use(canAnswerFriendshipRequest)
    .input(AnswerFriendshipRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .updateTable('friendships')
        .set({
          status: FriendshipStatusSchema.Values['declined'],
        })
        .where('friendships.userId', '=', input.friendUserId)
        .where('friendships.friendUserId', '=', ctx.session.userId)
        .execute()

      /**
       * Question 2: Implement api to decline a friendship request
       *
       * Set the friendship request status to `declined`
       *
       * Instructions:
       *  - Go to src/server/tests/friendship-request.test.ts, enable the test
       * scenario for Question 2
       *  - Run `yarn test` to verify your answer
       *
       * Documentation references:
       *  - https://vitest.dev/api/#test-skip
       */
    }),
})
