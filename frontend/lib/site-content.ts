import { SITE_URL } from "@/lib/seo";

// One source for the visible FAQ and its structured data.
export const SITE_FAQS = [
  {
    question: "What is Rainbone?",
    answer: "Rainbone is a research prototype that combines CT-derived bone models, finite element analysis, interactive 3D views and checked AI explanations. It helps care teams explore bone strength and the research behind fall-fracture risk.",
  },
  {
    question: "Who is Rainbone for?",
    answer: "Rainbone is for the care team in nursing homes and senior living: nurses, CNAs, wellness directors, doctors and admin staff. It was built for PointClickCare’s Catch It Early challenge; it has no PointClickCare integration.",
  },
  {
    question: "Is Rainbone a medical device?",
    answer: "No. Rainbone is a research prototype, not a medical device. No clinical deployment, patient benefit or fracture-prevention result is claimed. It has not been clinically validated. Its outputs are research illustrations and published study references, not clinical recommendations.",
  },
  {
    question: "What does the 47.1% value mean?",
    answer: "The 47.1% shown for HFValid Pat001 is the HFValid authors’ published absolute risk of fracture (ARF0) model estimate. It is a study value, not a risk calculated or clinically validated by Rainbone for a new patient.",
  },
  {
    question: "How does the AI work?",
    answer: "Ask Rainbone uses an AI agent workflow orchestrated with LangGraph: triage, evidence, writer, critic and audit. The Gemini API can select evidence tools and approved statements; code checks the selected statements and their numbers before rendering. Groq and rules provide fallbacks, and the interface identifies what actually ran.",
  },
  {
    question: "Where does the data come from?",
    answer: "The reference femur and published study values come from HFValid; the pelvic imaging library uses CTPelvic1K. Vultr Compute runs the engine, and Vultr Object Storage holds meshes and verified facts. Tiger Data (TimescaleDB) records simulation runs and AI provenance, with storage status shown in the app.",
  },
  {
    question: "Is the approximately 11% stress ratio a fracture probability?",
    answer: "No. It is computed stress divided by an assumed material strength of 150 MPa, expressed as a percentage. This research stress ratio is separate from the published ARF0 model estimate and is not a probability of fracture.",
  },
] as const;

export const LANDING_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#application`,
      name: "Rainbone",
      url: `${SITE_URL}/`,
      description: SITE_FAQS[0].answer,
      applicationCategory: "HealthApplication",
      operatingSystem: "Web browser",
      browserRequirements: "Requires JavaScript and WebGL",
      inLanguage: "en-CA",
      creator: { "@id": `${SITE_URL}/#team` },
      audience: { "@type": "Audience", audienceType: "Care teams in nursing homes and senior living: nurses, CNAs, wellness directors, doctors and admin staff" },
      image: `${SITE_URL}/opengraph-image`,
      sameAs: [
        "https://github.com/galitau/Rainbone_prod_hackthevalley11",
        "https://devpost.com/software/rainbowbone",
      ],
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#team`,
      name: "Rainbone project team",
      description: "The team that built the Rainbone research prototype at Hack the Valley 11.",
      url: `${SITE_URL}/#data`,
      member: ["Galit Tauber", "Camila Rojas", "Jisara Wuttikreekiat", "Marco Anthony Ayuste"]
        .map(name => ({ "@type": "Person", name })),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Rainbone",
      url: `${SITE_URL}/`,
      inLanguage: "en-CA",
      publisher: { "@id": `${SITE_URL}/#team` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      url: `${SITE_URL}/#faq`,
      inLanguage: "en-CA",
      mainEntity: SITE_FAQS.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
};
