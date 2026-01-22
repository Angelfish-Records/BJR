import {client} from '../sanity/lib/client'
import {urlFor} from '../sanity/lib/image'
import EarlyAccessForm from './EarlyAccessForm'

const landingQuery = `
  *[_id == "landingPage"][0]{
    title,
    subtitle,
    ctaText,
    ctaHref,
    backgroundImage
  }
`

const dupesQuery = `
  count(*[_type == "landingPage" && _id != "landingPage"])
`

export default async function Home() {
  const [data, dupesCount] = await Promise.all([
    client.fetch(landingQuery, {}, {next: {tags: ['landingPage']}}),
    client.fetch(dupesQuery),
  ])

  if (dupesCount > 0) {
    console.error(
      `Sanity warning: ${dupesCount} rogue landingPage documents exist. Homepage is using the singleton.`
    )
  }

  const bgUrl =
    data?.backgroundImage
      ? urlFor(data.backgroundImage).width(2400).height(1400).quality(80).url()
      : null

  return (
    <main
      style={{
        minHeight: '100svh',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#050506',
        color: 'rgba(255,255,255,0.92)',
      }}
    >
      {/* Background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: bgUrl
            ? `url(${bgUrl})`
            : `radial-gradient(1200px 800px at 20% 20%, rgba(255,255,255,0.10), transparent 60%),
               radial-gradient(900px 700px at 80% 40%, rgba(255,255,255,0.06), transparent 55%),
               linear-gradient(180deg, #050506 0%, #0b0b10 70%, #050506 100%)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: bgUrl ? 'saturate(0.9) contrast(1.05)' : undefined,
          transform: 'none',
        }}
      />

      {/* Dark overlay for readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.78) 100%)',
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          minHeight: '100svh',
          display: 'grid',
          placeItems: 'center',
          padding: '96px 24px',
        }}
      >
        <section
          style={{
            width: '100%',
            maxWidth: 840,
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(40px, 6vw, 72px)',
              lineHeight: 1.02,
              margin: 0,
              marginBottom: 18,
              textWrap: 'balance',
            }}
          >
            {data?.title ?? 'Coming soon'}
          </h1>

          <p
            style={{
              fontSize: 'clamp(16px, 2.2vw, 22px)',
              lineHeight: 1.5,
              opacity: 0.85,
              margin: '0 auto 34px',
              maxWidth: 720,
              textWrap: 'pretty',
            }}
          >
            {data?.subtitle ?? 'A new home for audio and video—built for members, not platforms.'}
          </p>

          <div style={{display: 'grid', justifyItems: 'center', gap: 14}}>
            <EarlyAccessForm />

            {data?.ctaText && data?.ctaHref && (
              <a
                href={data.ctaHref}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px 14px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.22)',
                  background: 'transparent',
                  textDecoration: 'none',
                  color: 'rgba(255,255,255,0.82)',
                  fontSize: 14,
                }}
              >
                {data.ctaText}
              </a>
            )}
          </div>

          <div
            style={{
              marginTop: 44,
              display: 'flex',
              justifyContent: 'center',
              gap: 14,
              flexWrap: 'wrap',
              opacity: 0.75,
              fontSize: 13,
            }}
          >

          </div>
        </section>
      </div>
    </main>
  )
}
