import { Resolver, Query, Mutation, Arg, ObjectType, Field, Ctx, UseMiddleware, Int } from 'type-graphql'
import { User } from './entity/User'
import { hash, compare } from 'bcryptjs'
import { MyContext } from './MyContext'
import { createAccessToken, createRefreshToken } from './auth'
import { isAuth } from './isAuthMiddleware'
import { sendRefreshToken } from './sendRefreshToken'
import { getConnection } from 'typeorm'
import { verify } from 'jsonwebtoken'

@ObjectType()
class LoginResponse {
    @Field()
    accessToken: string
    @Field(() => User)
    user: User
}

@Resolver()
export class UserResolvers {
    @Query(() => String)
    hello() {
        return 'b-fit hello'
    }

    @Query(() => String)
    @UseMiddleware(isAuth)
    bye(
        @Ctx() { payload }: MyContext
    ) {
        return `your user id is ${payload!.userId}`
    }


    @Query(() => [User])
    users() {
        return User.find()
    }

    @Query(() => User, { nullable: true })
    me(
        @Ctx() context: MyContext
    ) {
        const authorization = context.req.headers['authorization']

        if(!authorization) {
            return null
        }
    
        try {
            const token = authorization?.split(' ')[1]
            const payload: any = verify(token, process.env.ACCESS_TOKEN_SECRET!)
            return User.findOne(payload.userId)
        } catch(err) {
            console.log(err)
            return null
        }
    }

    @Mutation(() => Boolean)
    async logout(
        @Ctx() {res} : MyContext
    ) {
        sendRefreshToken(res, '')
        return true
    }

    @Mutation(() => Boolean)
    async revokeRefreshTokensForUser(
        @Arg('userId', () => Int) userId: number
    ) {
        await getConnection().getRepository(User).increment({ id: userId }, "tokenVersion", 1)
        return true
    }

    @Mutation(() => LoginResponse)
    async login(
        @Arg('email') email: string,
        @Arg('password') password: string,
        @Ctx() { res }: MyContext
    ): Promise<LoginResponse> {
        const user = await User.findOne({ where: { email } })

        if (!user) {
            throw new Error('could not find user')
        }

        const valid = await compare(password, user.password)

        console.log(valid)

        if (!valid) {
            throw new Error('bad password')
        }

        sendRefreshToken(res, createRefreshToken(user))

        return {
            accessToken: createAccessToken(user),
            user
        }
    }

    @Mutation(() => Boolean)
    async register(
        @Arg('email') email: string,
        @Arg('password') password: string,
    ) {
        const hashedPassword = await hash(password, 12)

        try {
            await User.insert({
                email,
                password: hashedPassword
            })
        } catch (err) {
            console.log(err)
            return false
        }

        return true
    }
}