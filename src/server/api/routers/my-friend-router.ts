import type { Database } from '@/server/db'

import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { FriendshipStatusSchema } from '@/utils/server/friendship-schemas'
import { protectedProcedure } from '@/server/trpc/procedures'
import { router } from '@/server/trpc/router'
import {
  NonEmptyStringSchema,
  CountSchema,
  IdSchema,
} from '@/utils/server/base-schemas'
import { User } from '@/server/db/types'

export const myFriendRouter = router({
  getById: protectedProcedure
    .input(
      z.object({
        friendUserId: IdSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      
      const result = await countMutualFriend(ctx.db, ctx.session.userId, input.friendUserId)
      
      let countMutual = Number(result[0]!.mutualFriendCount);
   
      // return ctx.db.connection().execute(
        // async (conn) => 
          /**
           * Question 4: Implement mutual friend count
           *
           * Add `mutualFriendCount` to the returned result of this query. You can
           * either:
           *  (1) Make a separate query to count the number of mutual friends,
           *  then combine the result with the result of this query
           *  (2) BONUS: Use a subquery (hint: take a look at how
           *  `totalFriendCount` is implemented)
           *
           * Instructions:
           *  - Go to src/server/tests/friendship-request.test.ts, enable the test
           * scenario for Question 3
           *  - Run `yarn test` to verify your answer
           *
           * Documentation references:
           *  - https://kysely-org.github.io/kysely/classes/SelectQueryBuilder.html#innerJoin
           */
          
          const res = await ctx.db
            .selectFrom('users as friends')
            .innerJoin('friendships', 'friendships.friendUserId', 'friends.id')
            .innerJoin(
              userTotalFriendCount(ctx.db).as('userTotalFriendCount'),
              'userTotalFriendCount.userId',
              'friends.id'
            )
            .where('friendships.userId', '=', ctx.session.userId)
            .where('friendships.friendUserId', '=', input.friendUserId)
            .where(
              'friendships.status',
              '=',
              FriendshipStatusSchema.Values['accepted']
            )
            .select([
              'friends.id',
              'friends.fullName',
              'friends.phoneNumber',
              'totalFriendCount',
            ])
            .executeTakeFirstOrThrow(() => new TRPCError({ code: 'NOT_FOUND' }))
            .then(
              z.object({
                id: IdSchema,
                fullName: NonEmptyStringSchema,
                phoneNumber: NonEmptyStringSchema,
                totalFriendCount: CountSchema,
                mutualFriendCount: CountSchema,
              }).parse
            )
          res.mutualFriendCount = countMutual
          return res
      // )
    }),
})

const userTotalFriendCount = (db: Database) => {
  return db
    .selectFrom('friendships')
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])
    .select((eb) => [
      'friendships.userId',
      eb.fn.count('friendships.friendUserId').as('totalFriendCount'),
    ])
    .groupBy('friendships.userId')
}

// const countMutualFriend = async (db: Database, user1: number, user2: number) => {
//   return await (
//     db
//       .selectFrom('friendships')
//       .where(
//         'friendships.status',
//         '=',
//         FriendshipStatusSchema.Values['accepted']
//       )
//       .where('friendships.userId', '=', user1)
//       .where(
//         'friendships.friendUserId',
//         'in',
//         db
//           .selectFrom('friendships as f2')
//           .where('f2.status', '=', FriendshipStatusSchema.Values['accepted'])
//           .where('f2.userId', '=', user2)
//           .select('f2.friendUserId')
//       )
//       .select((eb) => [
//         eb.fn.count('friendships.friendUserId').as('mutualFriendCount'),
//       ])
//       .groupBy('friendships.userId')
//   )
//   .execute()
// }

const countMutualFriend = async (db: Database, user1: number, user2: number) => {
  // Get a list of user1's friends
  const user1Friends = db
    .selectFrom('friendships')
    .where('friendships.userId', '=', user1)
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])
    .select('friendships.friendUserId')
  
  // Get a list of user2's friends
  const user2Friends = db
    .selectFrom('friendships')
    .where('friendships.userId', '=', user2)
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])
    .select('friendships.friendUserId')
  
  // Count the number of mutual friends between user1 and user2
  return db
    .selectFrom('friendships')
    .where('friendships.friendUserId', 'in', user1Friends)
    .where('friendships.friendUserId', 'in', user2Friends)
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])
    .where('friendships.userId', '=', user1)
    .select((eb) => [
      'friendships.userId',
      eb.fn.count('friendships.id').as('mutualFriendCount'),
    ]).execute()
}
