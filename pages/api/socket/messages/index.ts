import { currentProfile } from "@/lib/current-profile-pages"
import { db } from "@/lib/db"
import { NextApiResponseServerIo } from "@/types"
import { NextApiRequest } from "next"

export default async (req: NextApiRequest, res: NextApiResponseServerIo) => {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" })
  try {
    const profile = await currentProfile(req) // 👈 import from pages
    const { content, fileUrl } = req.body
    const { serverId, channelId } = req.query

    if (!profile) return res.status(401).json({ error: "Unauthorized" })
    if (!serverId || !channelId || !content)
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
        serverId: server.id,
      },
    })

    const member = server.members.find(
      (member) => member.profileId === profile.id
    )

    if (!channel || !member)
      return res.status(404).json({ error: "Channel or Member not found" })

    const message = await db.message.create({
      data: {
        content,
        fileUrl,
        memberId: member.id,
        channelId: channel.id,
      },
      include: {
        member: {
          include: {
            profile: true,
          },
        },
      },
    })

    const channelKey = "chat:" + channelId + ":messages"

    res?.socket?.server?.io?.emit(channelKey, message)

    return res.status(200).json({ message })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: "Internal server error" })
  }
}
