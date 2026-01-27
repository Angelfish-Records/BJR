// web/emails/GiftCreated.tsx
import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export type GiftCreatedEmailProps = {
  appName: string
  toEmail: string
  albumTitle: string
  albumArtist?: string
  albumCoverUrl?: string
  personalNote?: string | null
  senderName?: string | null
  giftUrl: string
  supportEmail?: string
}

export function GiftCreatedEmail(props: GiftCreatedEmailProps) {
  const {
    appName,
    toEmail,
    albumTitle,
    albumArtist,
    albumCoverUrl,
    personalNote,
    senderName,
    giftUrl,
    supportEmail,
  } = props

  const preview = `You’ve been gifted ${albumTitle}.`
  const note = typeof personalNote === 'string' ? personalNote.trim() : ''

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{margin: 0, padding: 0, backgroundColor: '#0b0b0b'}}>
        <Container style={{maxWidth: 560, margin: '0 auto', padding: '28px 16px'}}>
          <Section style={{textAlign: 'left'}}>
            <Text style={{color: '#a7a7a7', fontSize: 12, letterSpacing: 0.3, margin: '0 0 10px'}}>
              {appName}
            </Text>
            <Heading style={{color: '#ffffff', fontSize: 28, margin: '0 0 10px', lineHeight: 1.15}}>
              You’ve got a gift.
            </Heading>

            <Text style={{color: '#d7d7d7', fontSize: 14, margin: '0 0 18px', lineHeight: 1.5}}>
              {(senderName ?? 'Someone')} bought you a copy of{' '}
              <span style={{color: '#ffffff', fontWeight: 700}}>{albumTitle}</span>
              {albumArtist ? ` by ${albumArtist}` : ''}.
            </Text>
          </Section>

          {albumCoverUrl ? (
            <Section style={{margin: '16px 0 18px'}}>
              <Img
                src={albumCoverUrl}
                alt={albumTitle}
                width={528}
                style={{
                  width: '100%',
                  height: 'auto',
                  borderRadius: 16,
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              />
            </Section>
          ) : null}

          <Section style={{margin: '0 0 16px'}}>
            <Button
              href={giftUrl}
              style={{
                backgroundColor: '#ffffff',
                color: '#0b0b0b',
                fontSize: 14,
                fontWeight: 700,
                padding: '12px 18px',
                borderRadius: 12,
                display: 'inline-block',
                textDecoration: 'none',
              }}
            >
              Open your gift
            </Button>
          </Section>

          <Text style={{color: '#bdbdbd', fontSize: 12, margin: '0 0 18px', lineHeight: 1.5}}>
            If prompted, sign in with <span style={{color: '#ffffff'}}>{toEmail}</span>.
          </Text>

          {note ? (
            <Section
              style={{
                border: '1px solid rgba(255,255,255,0.10)',
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderRadius: 14,
                padding: 14,
                margin: '0 0 18px',
              }}
            >
              <Text style={{color: '#ffffff', fontSize: 13, margin: 0, lineHeight: 1.55}}>
                {personalNote}
              </Text>
            </Section>
          ) : null}

          <Hr style={{borderColor: 'rgba(255,255,255,0.10)', margin: '22px 0'}} />

          <Text style={{color: '#8f8f8f', fontSize: 11, margin: 0, lineHeight: 1.5}}>
            If you didn’t expect this, you can ignore this email.
            {supportEmail ? (
              <>
                {' '}
                Need help? Reply to this message or contact <span style={{color: '#cfcfcf'}}>{supportEmail}</span>.
              </>
            ) : null}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default GiftCreatedEmail
