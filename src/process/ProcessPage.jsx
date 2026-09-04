import React from 'react';
import './process.css';

// Asset imports
import editorialHeader from './assets/editorial_teal_and_gold_header.png';
import processQuote from './assets/the_process_building_toward_answers.png';
import goldenTimeline from './assets/golden_wavy_timeline_divider.png';
import cardListen from './assets/pinned_listen_process_card.png';
import cardDiscover from './assets/discover_audience_whitespace_note.png';
import cardConcept from './assets/torn_paper_concept_card_with_03_badge.png';
import cardDesign from './assets/step_04_design_paper_card.png';
import cardBuild from './assets/pinned_build_process_card.png';
import cardLaunch from './assets/torn_paper_launch_infographic_card.png';
import cardGrow from './assets/botanical_grow_paper_collage.png';

const ProcessPage = () => {
  return (
    <section className="process-page">
      <div className="process-artboard">
        {/* 1. EDITORIAL HEADER */}
        <img
          src={editorialHeader}
          className="asset editorial-header"
          alt="01 - 100% strategy — HOW WE BUILD. Seven steps from initial idea to lasting digital impact."
        />

        {/* 2. THE PROCESS QUOTE */}
        <img
          src={processQuote}
          className="asset process-quote"
          alt="the process — We don't rush to the answer. We build toward it."
        />

        {/* 3. GOLDEN WAVY TIMELINE DIVIDER */}
        <img
          src={goldenTimeline}
          className="asset timeline-divider"
          alt=""
        />

        {/* 4. STEP 01 - LISTEN */}
        <img
          src={cardListen}
          className="asset card-listen"
          alt="01 LISTEN — Deep intake conversations to understand your origin story, business model, challenges, and aspirations."
        />

        {/* 5. STEP 02 - DISCOVER */}
        <img
          src={cardDiscover}
          className="asset card-discover"
          alt="02 DISCOVER — Audience research and market auditing to pinpoint the exact whitespace your brand can own."
        />

        {/* 6. STEP 03 - CONCEPT */}
        <img
          src={cardConcept}
          className="asset card-concept"
          alt="03 CONCEPT — Articulating the strategic blueprint — brand positioning, narrative voice, and visual direction framework."
        />

        {/* 7. STEP 04 - DESIGN */}
        <img
          src={cardDesign}
          className="asset card-design"
          alt="04 DESIGN — Crafting brand logo suites, typography systems, editorial web layouts, and social media post assets."
        />

        {/* 8. STEP 05 - BUILD */}
        <img
          src={cardBuild}
          className="asset card-build"
          alt="05 BUILD — Bespoke frontend web engineering with fluid motion, 90+ PageSpeed performance, and automated AI workflows."
        />

        {/* 9. STEP 06 - LAUNCH */}
        <img
          src={cardLaunch}
          className="asset card-launch"
          alt="06 LAUNCH — Seamless deployment, go-to-market social campaign release, and launch day orchestration."
        />

        {/* 10. STEP 07 - GROW */}
        <img
          src={cardGrow}
          className="asset card-grow"
          alt="07 GROW — Ongoing daily reels strategy, post-launch optimization, and scaling your brand presence forward."
        />
      </div>
    </section>
  );
};

export default ProcessPage;
