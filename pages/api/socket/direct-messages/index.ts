import { currentProfile } from "@/lib/current-profile-pages"
import { db } from "@/lib/db"
import { NextApiResponseServerIo } from "@/types"
import { NextApiRequest } from "next"

export default async (req: NextApiRequest, res: NextApiResponseServerIo) => {
  if (req.method !== "POST") {
    console.log("test")
    return res.status(405).json({ error: "Method not allowed" })
  }
  try {
    const profile = await currentProfile(req) // 👈 import from pages
    const { content, fileUrl } = req.body
    const { conversationId } = req.query

    if (!profile) return res.status(401).json({ error: "Unauthorized" })
    if (!conversationId || !content)
      return res
        .status(400)
        .json({ error: "Bad request Conversation ID or content missing" })

    const conversation = await db.conversation.findFirst({
      where: {
        id: conversationId as string,
        OR: [
          {
            memberOne: {
              profileId: profile.id,
            },
          },
          {
            memberTwo: {
              profileId: profile.id,
            },
          },
        ],
      },
      include: {
        memberOne: {
          include: {
            profile: true,
          },
        },
        memberTwo: {
          include: {
            profile: true,
          },
        },
      },
    })
    const member =
      conversation?.memberOne.profileId === profile.id
        ? conversation?.memberOne
        : conversation?.memberTwo

    if (!conversation)
      return res.status(404).json({ error: "Conversation not found" })

    if (!member) return res.status(404).json({ error: "Member not found" })

    const message = await db.directMessage.create({
      data: {
        content,
        fileUrl,
        memberId: member.id,
        conversationId: conversation.id,
      },
      include: {
        member: {
          include: {
            profile: true,
          },
        },
      },
    })

    const channelKey = "chat:" + conversationId + ":messages"

    res?.socket?.server?.io?.emit(channelKey, message)

    return res.status(200).json({ message })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: "Internal server error" })
  }
}
