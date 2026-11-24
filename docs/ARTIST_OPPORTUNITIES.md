# Artist Opportunities

Opportunities is the third navigation mode in Hangabout. It uses the existing Vite app, URL history, visual styles, GitHub Actions and GitHub Pages. See Art and Make Art retain their existing datasets and discovery behaviour. Opportunity deep links use `#opportunity-<id>` and work under the Pages base path. Filters run in the browser without accounts, tracking or disclosure of personal eligibility information.

## Launch coverage

The first-party checks on 25 November 2026 (Melbourne time) produced eight records from five public programmes across four independent funders. Seven records had full first-party verification at launch, and one had a confirmed future deadline with round details pending. Six supported an open-application status, one was forthcoming and one was archived.

| First-party programme | Launch records | Material evidence and gaps |
| --- | --- | --- |
| [Creative Australia Arts Projects](https://creative.gov.au/investments-opportunities/arts-projects-individuals-and-groups) | September 2026 archive and March 2027 announced deadline | Archived AUD 10,000–50,000 round and access-cost provisions. The funder publishes a March deadline ahead of the new application link, opening date and round terms. |
| [Music Australia professional development](https://creative.gov.au/investments-opportunities/music-australia-export-development-fund-international-professional-and-artistic-development) | December 2026 round | AUD 3,000–15,000 matched funding. Applicants need eligible cash funding equal to the grant request. |
| [Ian Potter Cultural Trust Emerging Artist Grants](https://www.ianpotterculturaltrust.org.au/opportunities/emerging-artist-grants/how-to-apply/) | Round 1, 2027 | Up to AUD 15,000 for eligible emerging artists, mainly for development overseas. The individual contribution has no published fixed amount. |
| [Wyndham City Arts Grants](https://www.wyndham.vic.gov.au/services/arts-culture/residencies-commissions-grants/2027-wyndham-arts-grants) | Creative Development, Skills Development and Presentation | Caps of AUD 3,000, 3,000 and 5,000. Development applicants must live in Wyndham. Presentation projects must take place there and can be proposed by artists who live outside the area. |
| [Pollock-Krasner Foundation Grant](https://www.pkf.org/how-to-apply/) | Rolling international application | Up to USD 50,000 for professional visual artists in the listed media. The funder welcomes worldwide applicants. |

The checked pages did not establish an application or participation fee for these records. Those fields stay unknown and do not satisfy the free-application filter. Caps are advertised award amounts. Participant contributions are shown independently. The amount filter requires a matching currency, so it never compares nominal AUD and USD values. Exchange-rate conversion is deferred pending a maintained, dated first-party rates source.

The registry contains 40 entries, including the 38 requested organisations and directories, Wyndham City and Music Australia. Five have active adapters. All other URLs are leads pending activation review, except the Australian Cultural Fund, which is a reference-only fundraising platform. The launch data covers Victorian municipal programmes, national funding and one foreign funder. It does not provide broad state, regional, residency, award or disability-specific coverage.

## Source activation and changes

Before enabling a source, verify its canonical public pages, source terms, robots directives, applicant geography and programme relevance. Inspect APIs, feeds and structured metadata before implementing page extraction. The active pages exposed the necessary evidence in public HTML. The Wyndham adapter discovers dated round pages from the council index. The other adapters monitor reviewed programme URLs and create new records when those pages publish a new round. Inspect the source registry for reviewed dates, coverage and fetch cadence.

The Python standard-library fetcher checks robots directives, applies crawl delay, enforces time and response-size limits, retries transient failures and stops on access restrictions or redirects. Third-party application portals are linked from public funder evidence. The job does not fetch authenticated application forms. Keep summaries in Hangabout’s words and publish only the facts needed for discovery. Activate directories as discovery sources in a subsequent coverage phase, with original funder confirmation before publication.

The versioned catalogue holds first-party links, discovery provenance, timing, financial terms, eligibility and editorial fields. Null means a detail has not been established for the record. Explicit zero fees require evidence and remain distinguishable from null. Programmes with a shared page have separate round or stream keys. Where a provider publishes no round number, the adapter uses the deadline’s year and month. A cross-month rescheduling or domain migration needs a reviewed identity reconciliation. Review explicit URL aliases for cross-source matching and retain the initial ID and original funder provenance. Similar titles alone are insufficient.

A failed fetch or incompatible extraction leaves the latest valid records intact. A successful check that no longer lists a round retains it and makes its verification stale. A returning round can recover the same ID. Changes to extracted facts or normalized source text appear in the review report. When terms change beyond the mapped fields, review the official page and update the adapter where needed before accepting the proposal. Open badges require fresh, first-party evidence. The client expires precise deadlines in the published zone and hides application actions once closed, suspended or overdue. A dated announcement without an opening date stays forthcoming until new evidence arrives or the deadline passes.

## Scheduled operation and release

`.github/workflows/opportunity-refresh.yml` checks due sources daily on main and retains a source-health report and proposed data patch for 30 days. The report records source failures, quarantined observations and the last successful fetch. Unchanged source checks do not create daily data churn. Periodic verification proposals renew the public checked date before records become overdue. Only a scheduled main run can open a draft review PR, and the workflow keeps at most one open proposal at a time. Review the diff and first-party links, then use the project’s normal merge and Pages verification flow. Pull request and manual checks are read-only in GitHub.

The pipeline uses five monitored sources, with a one- to seven-day source cadence. It introduces no paid API, model, database, npm or Python dependency. It uses existing Actions minutes, artifact retention and Pages hosting. The schedule is registered once the workflow reaches the default branch. Roll back code and catalogue changes by reverting the feature PR through the normal review flow. To pause proposals while retaining the UI, disable the workflow. To pause an individual source, move its registry entry to a reviewed inactive state and retain its validated records.

See [Local development](LOCAL_DEVELOPMENT.md#artist-opportunities) for the offline gate and live verification commands.
