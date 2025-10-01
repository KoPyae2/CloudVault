"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FileManager } from "@/components/file-manager";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function HomePage() {
  const { data: session, status } = useSession();
  const [convexUser, setConvexUser] = useState<unknown>(null);
  const router = useRouter();
  const createOrUpdateUser = useMutation(api.users.createOrUpdateUser);
   const getUserByGoogleId = useQuery(
    api.users.getUserByGoogleId,
    session?.user?.id ? { googleId: session.user.id } : "skip"
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user && !convexUser) {
      const syncUser = async () => {
        try {
          const userId = await createOrUpdateUser({
            googleId: session.user.id!,
            email: session.user.email!,
            name: session.user.name!,
            photoUrl: session.user.image || undefined,
          });
          console.log("User synced with Convex:", userId);
        } catch (error) {
          console.error("Error syncing user:", error);
        }
      };
      syncUser();
    }
  }, [session?.user, convexUser, createOrUpdateUser]);

  useEffect(() => {
    if (getUserByGoogleId) {
      setConvexUser(getUserByGoogleId);
    }
  }, [getUserByGoogleId]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null; // Will redirect via useEffect
  }

  return <FileManager />;
}
