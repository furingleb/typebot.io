import { authenticateUser } from '@/features/auth/api'
import prisma from '@/lib/prisma'
import { withSentry } from '@sentry/nextjs'
import { Typebot, WebhookBlock } from 'models'
import { NextApiRequest, NextApiResponse } from 'next'
import { byId } from 'utils'
import { methodNotAllowed } from 'utils/api'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const user = await authenticateUser(req)
  if (!user) return res.status(401).json({ message: 'Not authenticated' })
  if (req.method === 'POST') {
    const body = req.body as Record<string, string>
    if (!('url' in body))
      return res.status(403).send({ message: 'url is missing in body' })
    const { url } = body
    const typebotId = req.query.typebotId as string
    const blockId = req.query.blockId as string
    const typebot = (await prisma.typebot.findFirst({
      where: {
        id: typebotId,
        workspace: { members: { some: { userId: user.id } } },
      },
    })) as unknown as Typebot | undefined
    if (!typebot) return res.status(400).send({ message: 'Typebot not found' })
    try {
      const { webhookId } = typebot.groups
        .flatMap((g) => g.blocks)
        .find(byId(blockId)) as WebhookBlock
      await prisma.webhook.upsert({
        where: { id: webhookId },
        update: { url, body: '{{state}}', method: 'POST' },
        create: { url, body: '{{state}}', method: 'POST', typebotId },
      })

      return res.send({ message: 'success' })
    } catch (err) {
      return res
        .status(400)
        .send({ message: "groupId doesn't point to a Webhook block" })
    }
  }
  return methodNotAllowed(res)
}

export default withSentry(handler)
