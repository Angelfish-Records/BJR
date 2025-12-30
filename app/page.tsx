import {client} from '../sanity/lib/sanity'

const query = `
  *[_type == "landingPage"][0]{
    title,
    subtitle,
    ctaText,
    ctaHref
  }
`

export default async function Home() {
  const data = await client.fetch(query)

  if (!data) {
    return (
      <main style={{padding: 48}}>
        <p>No landing page content found.</p>
      </main>
    )
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '120px 24px',
        textAlign: 'center',
      }}
    >
      <h1 style={{fontSize: 48, lineHeight: 1.1, marginBottom: 24}}>
        {data.title}
      </h1>

      <p style={{fontSize: 20, opacity: 0.85, marginBottom: 40}}>
        {data.subtitle}
      </p>

      {data.ctaText && data.ctaHref && (
        <a
          href={data.ctaHref}
          style={{
            display: 'inline-block',
            padding: '14px 22px',
            borderRadius: 999,
            border: '1px solid currentColor',
            textDecoration: 'none',
            fontSize: 16,
          }}
        >
          {data.ctaText}
        </a>
      )}
    </main>
  )
}
