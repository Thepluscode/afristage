'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  ArrowRight,
  CircleDollarSign,
  Gift,
  Heart,
  MonitorPlay,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import styles from './site.module.css';

// The public web viewer (apps/web) — where "watch live, free, no card" actually
// happens. Overridable per environment; defaults to the deployed staging service.
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || 'https://web-production-4ee7e.up.railway.app';

const features = [
  {
    kicker: 'Live rooms',
    title: 'A stage that feels alive before the stream even starts.',
    body: 'Cinematic discovery, creator-led rooms, chat, reactions, gifts, and safety controls share one native-feeling flow.',
    icon: MonitorPlay,
    image: '/site/feature-live-rooms.jpg',
    imageAlt: 'A singer performing for a live camera in a warmly lit home studio.'
  },
  {
    kicker: 'Creator economy',
    title: 'Gifts, wallets, payouts, and ledgers built as one money spine.',
    body: 'Every coin movement is traceable from purchase to gift split to payout hold, review, approval, and paid confirmation.',
    icon: CircleDollarSign,
    image: '/site/feature-creator-economy.jpg',
    imageAlt: 'A music creator reviewing earnings on a phone backstage after a performance.'
  },
  {
    kicker: 'Trust operations',
    title: 'Moderation and payout pressure sit where operators decide.',
    body: 'Reports, fraud holds, support tickets, audit logs, and ledger integrity are surfaced as launch-day command signals.',
    icon: ShieldCheck,
    image: '/site/feature-trust-operations.jpg',
    imageAlt: 'A live-event operator monitoring a broadcast from a dark control room.'
  },
  {
    kicker: 'Creator control',
    title: 'The performer sees the room, the audience, and the money clearly.',
    body: 'Go-live setup, audience controls, creator analytics, supporter context, and payout readiness live in one coherent mobile workflow.',
    icon: Sparkles,
    image: '/site/feature-creator-control.jpg',
    imageAlt: 'A musician preparing a camera, microphone, and tablet before going live.'
  }
];

const proof = [
  ['41+', 'green MVP validation checks'],
  ['9', 'core beta operating surfaces'],
  ['60/40', 'creator gift split model'],
  ['<15m', 'critical moderation response target']
];

const steps = [
  {
    label: 'Invite',
    title: 'Curate the room before the first user arrives.',
    body: 'Closed beta invites, creator approvals, and waitlist review keep the early network intentional.'
  },
  {
    label: 'Go live',
    title: 'Creators launch with context, not chaos.',
    body: 'Room setup, region, language, LiveKit tokens, chat, reactions, and gift rails come online as one sequence.'
  },
  {
    label: 'Monetise',
    title: 'Support becomes accountable money movement.',
    body: 'Gift volume, wallet balances, payout holds, and provider state are readable before finance approves anything.'
  },
  {
    label: 'Govern',
    title: 'Safety and operations are part of the product surface.',
    body: 'Moderators see priority reports, support owners see SLA pressure, and every sensitive action writes an audit trail.'
  }
];

const offers = [
  {
    title: 'Closed beta launch',
    subtitle: 'For first creator cohorts',
    body: 'Invite gates, creator approvals, support desk, moderation workflow, and launch-day runbook.',
    image: '/site/offer-closed-beta.jpg',
    imageAlt: 'Three creators preparing a closed beta stream together in a production studio.'
  },
  {
    title: 'Live economy',
    subtitle: 'For monetised rooms',
    body: 'Gift catalogue, wallet ledger, Paystack payments, payout review, fraud holds, and reconciliation evidence.',
    image: '/site/offer-live-economy.jpg',
    imageAlt: 'A creator reviewing her phone backstage while an audience waits beyond the curtain.'
  },
  {
    title: 'Operating system',
    subtitle: 'For scale-up control',
    body: 'Admin mission control, audit logs, analytics, SLA queues, incidents, and owner-led daily rhythm.',
    image: '/site/offer-operating-system.jpg',
    imageAlt: 'Two live-platform operators coordinating a broadcast from mission control.'
  }
];

export default function AfriStageSitePage() {
  const [activeStep, setActiveStep] = useState(0);
  const [motionReady, setMotionReady] = useState(false);
  const CurrentIcon = features[activeStep % features.length].icon;

  useEffect(() => {
    setMotionReady(true);
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!('IntersectionObserver' in window)) {
      sections.forEach((section) => section.classList.add(styles.revealed));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add(styles.revealed);
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <main className={`${styles.siteShell} ${motionReady ? styles.motionReady : ''}`}>
      <section className={styles.hero} id="top">
        <nav className={styles.nav} aria-label="AfriStage public navigation">
          <a className={styles.brand} href="#top">
            <span><Radio aria-hidden="true" size={21} strokeWidth={2.2} /></span>
            AFRISTAGE
          </a>
          <div className={styles.navLinks}>
            <a href="#why">Why</a>
            <a href="#platform">The stage</a>
            <a href="#offer">Creator economy</a>
          </div>
          <a className={styles.navCta} href="#offer">Join beta</a>
        </nav>

        <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Live streaming built for African creators</p>
            <h1><span>Africa,</span><strong>centre<br />stage.</strong></h1>
            <p className={styles.lede}>
              Go live from home. Reach the continent and its diaspora. Turn every gift into accountable earnings.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#offer">
                Claim your stage <ArrowRight size={18} />
              </a>
              <a className={styles.secondaryButton} href={`${WEB_URL}/watch`}><Play aria-hidden="true" size={16} fill="currentColor" /> Watch live now</a>
            </div>
            <div className={styles.liveMeta}>
              <span><i /> Live · Lagos</span>
              <div className={styles.viewerFaces}><b>Z</b><b>A</b><b>K</b></div>
              <small>24.6K watching</small>
            </div>
        </div>

        <div className={styles.liveFrame} aria-label="AfriStage live room preview">
          <div className={styles.liveFrameTop}>
            <span className={styles.liveCreator}>Zola Kim <b>✓</b></span>
            <button type="button">Follow</button>
            <span><Users size={13} /> 24.6K</span>
          </div>
          <div className={styles.liveTags}><b>LIVE</b><span>● Music</span><span>EN⌄</span></div>
          <div className={styles.liveChat}>
            <p><b>Ama_Gh</b><span>Great energy! 🔥</span></p>
            <p><b>TosinB</b><span>This is fire!</span></p>
            <p className={styles.giftChat}><Gift size={14} /><b>KingSteve</b><span>sent Rose · x5</span></p>
            <p><b>Nandi_Love</b><span>Voice on point!</span></p>
          </div>
          <div className={styles.hearts} aria-hidden="true">
            <Heart fill="currentColor" /><Heart fill="currentColor" /><Heart fill="currentColor" />
          </div>
          <div className={styles.liveInput}><span>Say something…</span><ArrowRight size={15} /></div>
        </div>

        <a className={styles.scrollCue} href="#why">
          <span>Scroll to explore</span><i />
        </a>
      </section>

      <section className={styles.problemSection} id="why" data-reveal="editorial">
        <div className={styles.sectionNumber}>01</div>
        <div>
          <p className={styles.eyebrow}>01 · Why AfriStage</p>
          <h2>The room was full.<br />The platform looked away.</h2>
        </div>
        <div className={styles.problemColumns}>
          <p>
            For too long, African creators have built audiences on platforms that don’t understand our reality or reward our value. We’re changing that.
          </p>
        </div>
      </section>

      <section className={styles.featureSection} id="platform" data-reveal="editorial">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Platform architecture</p>
          <h2>Every side of live, designed as one experience.</h2>
        </div>
        <figure className={styles.productShowcase}>
          <div className={styles.productShowcaseCopy}>
            <span>01 — 05</span>
            <strong>Discover. Join. Create. Earn. Move.</strong>
            <p>The energy of the room carries through every serious creator workflow.</p>
          </div>
          <Image
            className={styles.productShowcaseImage}
            src="/site/afristage-mobile-suite.jpg"
            width={1693}
            height={929}
            sizes="(max-width: 760px) 980px, 100vw"
            alt="AfriStage mobile experiences for discovery, live gifting, Go Live setup, creator analytics, and wallet management."
          />
          <figcaption className={styles.productShowcaseLegend}>
            <span>Live discovery</span>
            <span>Room energy</span>
            <span>Stage setup</span>
            <span>Creator control</span>
            <span>Wallet confidence</span>
          </figcaption>
        </figure>
        <div className={styles.featureMosaic}>
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article className={styles.featurePanel} key={feature.title}>
                <Image
                  className={styles.featureImage}
                  src={feature.image}
                  alt={feature.imageAlt}
                  fill
                  sizes="(max-width: 760px) calc(100vw - 28px), (max-width: 1080px) 50vw, 58vw"
                />
                <span className={styles.panelIndex}>0{index + 1}</span>
                <Icon size={28} />
                <p>{feature.kicker}</p>
                <h3>{feature.title}</h3>
                <span>{feature.body}</span>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.proofSection} data-reveal="editorial">
        <div className={styles.proofRibbon}>
          <span>Closed beta ready</span>
          <span>Ledger-first money</span>
          <span>LiveKit rooms</span>
          <span>Paystack rails</span>
          <span>Audit-led operations</span>
        </div>
        <div className={styles.proofGrid}>
          {proof.map(([value, label]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.processSection} id="process" data-reveal="editorial">
        <div className={styles.processCopy}>
          <p className={styles.eyebrow}>Interactive process</p>
          <h2>From curated invite to accountable payout.</h2>
          <p>
            The launch sequence is deliberately operational: each step has a product surface, a control surface, and an evidence trail.
          </p>
        </div>
        <div className={styles.processBoard}>
          <div className={styles.stepRail}>
            {steps.map((step, index) => (
              <button
                key={step.label}
                className={activeStep === index ? styles.activeStep : ''}
                type="button"
                onClick={() => setActiveStep(index)}
              >
                <span>0{index + 1}</span>
                {step.label}
              </button>
            ))}
          </div>
          <article className={styles.stepDetail} key={activeStep}>
            <CurrentIcon size={34} />
            <h3>{steps[activeStep].title}</h3>
            <p>{steps[activeStep].body}</p>
          </article>
        </div>
      </section>

      <section className={styles.offerSection} id="offer" data-reveal="editorial">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Premium offer</p>
          <h2>Launch AfriStage as a beta people can trust, not just a demo they can click.</h2>
        </div>
        <div className={styles.offerGrid}>
          {offers.map(({ title, subtitle, body, image, imageAlt }, index) => (
            <article key={title} className={index === 1 ? styles.featuredOffer : ''}>
              <Image
                className={styles.offerImage}
                src={image}
                alt={imageAlt}
                fill
                sizes="(max-width: 760px) calc(100vw - 28px), (max-width: 1080px) 50vw, 33vw"
              />
              <span>{subtitle}</span>
              <h3>{title}</h3>
              <p>{body}</p>
              <a href="/login">
                Open control plane <ArrowRight size={16} />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.ctaSection} data-reveal="editorial">
        <div>
          <p className={styles.eyebrow}>Final call</p>
          <h2>Build the stage. Govern the economy. Launch with evidence.</h2>
        </div>
        <a className={styles.primaryButton} href="/login">
          Enter mission control <ArrowRight size={18} />
        </a>
      </section>

      <footer className={styles.siteFooter}>
        <span>© 2026 AfriStage — every coin on the ledger.</span>
        <a href="/site/security">
          <ShieldCheck size={15} /> Security &amp; trust
        </a>
      </footer>
    </main>
  );
}
