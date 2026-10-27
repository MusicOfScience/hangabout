# Hangabout v1.0.1 release notes

Release date: 28 October 2026

v1.0.1 is a small trust-and-mobile-context patch prompted by live iPhone screenshots after the v1.0.0 release.

## Fixed

- **Stale opportunities no longer appear as live opportunities.** Dated opportunities that have passed the make-art verification window remain in canonical source history but fail closed on the live opportunity surface.
- **Stale studio availability no longer says `previously listed: available now`.** Historical availability is now rendered as historical evidence (`previously listed: advertised as available…`) rather than a contradictory current claim.
- **Make-art `sort near me` keeps the map and list in the same geographic context.** After geolocation, switching to see art and back to make art no longer refits the map to the full Melbourne resource extent while leaving the list distance-sorted.
- **Package metadata is aligned.** `package.json` and `package-lock.json` now both report v1.0.1; the lockfile had retained the prototype-era 0.2.0 root version.

## Regression coverage

The screenshot-derived behaviours are now exercised in both desktop Chrome and mobile Safari:

- expired opportunity exclusion;
- stale availability wording;
- near-me map centring before and after mode switches.

## Deliberately unchanged

The 24 October Jodi Wiley workshop is correctly absent from the 28 October forward-looking `happening soon` programme. The apparent top-screen overlap in the supplied iPhone capture was not changed because it is consistent with the host in-app browser chrome overlay rather than a confirmed Hangabout layout defect.
