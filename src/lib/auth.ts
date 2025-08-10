import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    // Credentials({
    //   name: "Email & Password",
    //   credentials: {
    //     email: { label: "Email", type: "text" },
    //     password: { label: "Password", type: "password" },
    //   },
    //   async authorize(creds) {
    //     if (!creds?.email || !creds?.password) return null;
    //     const user = await prisma.user.findUnique({
    //       where: { email: creds.email },
    //     });
    //     if (!user?.passwordHash) return null;
    //     const ok = bcrypt.compare(creds.password, user.passwordHash);
    //     return ok
    //       ? { id: user.id, email: user.email, name: user.name ?? undefined }
    //       : null;
    //   },
    // }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = (user as any).id;
      return token;
    },
    async session({ session, token }) {
      if (token?.id) (session.user as any).id = token.id;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
