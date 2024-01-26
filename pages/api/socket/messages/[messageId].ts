import { currentProfile } from "@/lib/current-profile-pages"
import { db } from "@/lib/db"
import { NextApiResponseServerIo } from "@/types"
import { MemberRole } from "@prisma/client"
import { NextApiRequest } from "next"

export default async (req: NextApiRequest, res: NextApiResponseServerIo) => {
  if (req.method !== "DELETE" && req.method !== "PATCH")
    return res.status(405).json({ error: "Method not allowed" })

  try {
    const profile = await currentProfile(req)
    const { serverId, channelId, messageId } = req.query
    const { content } = req.body
    if (!profile) return res.status(401).json({ error: "Unauthorized" })
    if (!serverId || !channelId || !messageId)
      return res
        .status(400)
        .json({ error: "Bad request Server or Channel ID or content missing" })
    const server = await db.server.findFirst({
      where: {
        id: serverId as string,
        members: {
          some: {
            profileId: profile.id,
          },
        },
      },
      include: {
        members: true,
      },
    })

    if (!server) return res.status(404).json({ error: "Server not found" })

    const channel = await db.channel.findFirst({
      where: {
        id: channelId as string,
        serverId: server.id as string,
      },
    })

    if (!channel) return res.status(404).json({ error: "Channel not found" })

    const member = server.members.find(
      (member) => member.profileId === profile.id
    )

    if (!member) return res.status(404).json({ error: "Member not found" })

    let message = await db.message.findFirst({
      where: {
        id: messageId as string,
        channelId: channel.id as string,
      },
      include: {
        member: {
          include: {
            profile: true,
          },
        },
      },
    })

    if (!message || message.deleted)
      return res.status(404).json({ error: "Message not found" })

    const isMessgeAuthor = message.memberId === member.id
    const isAdmin = member.role === MemberRole.ADMIN
    const isModerator = member.role === MemberRole.MODERATOR
    const canModify = isMessgeAuthor || isAdmin || isModerator

    if (!canModify)
      return res.status(401).json({ error: "Unauthorized to modify message" })

    if (req.method === "DELETE") {
      message = await db.message.update({
        where: {
          id: messageId as string,
        },
        data: {
          deleted: true,
          fileUrl: null,
          content: "This message has been deleted",
        },
        include: {
          member: {
            include: {
              profile: true,
            },
          },
        },
      })
    }

    if (req.method === "PATCH") {
      if (!isMessgeAuthor) {
        return res.status(401).json({ error: "Unauthorized to modify message" })
      }

      message = await db.message.update({
        where: {
          id: messageId as string,
        },
        data: {
          content,
        },
        include: {
          member: {
            include: {
              profile: true,
            },
          },
        },
      })
    }

    const updateKey = "chat:" + channelId + ":messages:update"

    res?.socket?.server?.io?.emit(updateKey, message)

    return res.status(200).json({ message })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Internal Error" })
  }
}
