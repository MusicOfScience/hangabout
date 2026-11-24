"""Deterministic adapters for the reviewed first-party opportunity sources."""

import re
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from zoneinfo import ZoneInfo

from discover_official import LinkParser

MELBOURNE = "Australia/Melbourne"
MONTH_DATE = r"\d{1,2} [A-Za-z]+ \d{4}"
MONEY = r"\$([\d,]+)"


class PageText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"style", "script", "svg", "noscript", "template"}:
            self.hidden_depth += 1
        if tag in {"p", "li", "br", "div", "section", "td", "tr", "h1", "h2", "h3", "h4", "h5"}:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in {"style", "script", "svg", "noscript", "template"}:
            self.hidden_depth -= 1
        if tag in {"p", "li", "div", "section", "td", "tr", "h1", "h2", "h3", "h4", "h5"}:
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.hidden_depth:
            self.parts.append(data)


def page_text(html):
    parser = PageText()
    main = re.search(r"<main\b[^>]*>(.*?)</main>", html, re.I | re.S)
    parser.feed(main[1] if main else html)
    return " ".join("".join(parser.parts).split())


def links(html, base):
    parser = LinkParser()
    parser.feed(html)
    return [(urljoin(base, href), label) for href, label in parser.links]


def application(html, base, host, path_pattern):
    matches = {
        url for url, _ in links(html, base)
        if urlsplit(url).scheme == "https" and urlsplit(url).netloc == host
        and re.fullmatch(path_pattern, urlsplit(url).path, re.I)
    }
    if len(matches) > 1:
        raise ValueError("multiple competing first-party application links")
    return next(iter(matches), None)


def require(pattern, text):
    match = re.search(pattern, text, re.I)
    if not match:
        raise ValueError(f"expected source evidence missing: {pattern}")
    return match


def local_date(text):
    return datetime.strptime(text, "%d %B %Y").date()


def local_instant(day, clock, zone=MELBOURNE):
    local_time = datetime.strptime(clock.replace(" ", "").upper(), "%I:%M%p").time()
    return datetime.combine(day, local_time, ZoneInfo(zone))


def amount(match):
    return int(match.replace(",", ""))


def money(maximum, currency, *, co_contribution=None, conditions=None, funding_type="direct"):
    return dict(minimum=None, maximum=maximum, currency=currency, type=funding_type,
                applicationFee=None, participationFee=None, coContribution=co_contribution,
                travel=None, accommodation=None, materials=None, otherCosts=None, conditions=conditions)


def eligibility(scope, geography, criteria, *, state=None, municipality=None, disciplines=None,
                career=None, **published):
    return dict(scope=scope, geography=geography, geographicConfidence=published.pop("geographicConfidence", "confirmed"),
                countries=["AU"] if scope in {"national", "municipality"} else None,
                states=[state] if state else None, municipalities=[municipality] if municipality else None,
                disciplines=disciplines, careerStages=career, citizenship=None, residency=None,
                age=None, applicantTypes=None, qualifications=None, specialistCriteria=None,
                accessibility=None, disabilitySpecific=None, criteria=criteria) | published


def timing(status, *, opening=None, opens_at=None, deadline=None, commencement=None, recurrence=None,
           rolling=False, duration=None):
    return dict(observedStatus=status, openingDate=opening.isoformat() if opening else None,
                opensAt=opens_at.isoformat() if opens_at else None,
                closingDate=deadline.date().isoformat() if deadline else None,
                closesAt=deadline.isoformat() if deadline else None,
                deadlineTimezone=deadline.tzinfo.key if deadline else None,
                commencementDate=commencement.isoformat() if commencement else None,
                duration=duration, recurrence=recurrence, rolling=rolling)


def calendar_status(day, opening, deadline, now, application_url):
    if now >= deadline:
        return "closed"
    if day < opening:
        return "forthcoming"
    return "open" if application_url else "unknown"


def override_status(text, status):
    if re.search(r"\b(?:this (?:round|program|programme|opportunity)|applications|funding round) (?:is |are |has been |have been )?(?:temporarily )?(?:suspended|cancelled|canceled|paused)\b", text, re.I):
        return "suspended"
    if re.search(r"\b(?:applications|funding round) (?:are |is |have |has |now )+(?:now )?closed\b", text, re.I):
        return "closed"
    return status


def entry(round_key, title, url, apply_url, categories, financial, eligible, dates, summary, **editorial):
    return dict(roundKey=round_key, title=title, officialUrl=url, applicationUrl=apply_url,
                categories=categories, funding=financial, eligibility=eligible, timing=dates,
                summary=summary, applicationRequirements=None, selectionCriteria=None, restrictions=None,
                uncertainties=None) | editorial


def potter(url, html, now, _supporting_html=None):
    text = page_text(html)
    round_match = require(r"Current Round\s*\|\s*Round (\d+), (\d{4})", text)
    number, year = round_match.groups()
    date_match = require(
        rf"Important Dates Applications Open (?:\w+ )?({MONTH_DATE}) Close (?:\w+ )?({MONTH_DATE}),\s*(\d{{1,2}}(?::\d{{2}})?\s*[AP]M) (AEDT|AEST)",
        text)
    opening = local_date(date_match[1])
    clock = re.sub(r"^(\d{1,2})(?=\s*[AP]M)", r"\1:00", date_match[3], flags=re.I)
    deadline = local_instant(local_date(date_match[2]), clock)
    if deadline.tzname() != date_match[4].upper():
        raise ValueError("published deadline zone conflicts with Melbourne local time")
    commencement_match = re.search(rf"For travel/projects after ({MONTH_DATE})", text, re.I)
    commencement = local_date(commencement_match[1]) if commencement_match else None
    cap = amount(require(rf"individual artists can apply for grants of up to {MONEY}", text)[1])
    require(r"Australian citizen or Permanent Resident of Australia", text)
    require(r"emerging or early-career artist", text)
    require(r"primarily funds projects undertaken overseas", text)
    require(r"Make a reasonable personal financial contribution", text)
    require(r"minimum of 18 years old", text)
    require(r"access to an Australian bank account in their name", text)
    require(r"does not mean applicants need to have attained formal qualifications", text)
    apply_url = application(html, url, "ipct.givingdata.com", rf"/portal/campaign/IPCT{year}Round{number}Application/?")
    status = calendar_status(now.astimezone(ZoneInfo(MELBOURNE)).date(), opening, deadline, now, apply_url)
    return [entry(
        f"{year}-round-{number}", f"Emerging Artist Grants · Round {number}, {year}", url, apply_url,
        ["artist-grant", "professional-development", "travel-mobility"],
        money(cap, "AUD", co_contribution="A reasonable personal contribution is required. No fixed amount is stated.",
              funding_type="partial"),
        eligibility("national", "Australia-wide · mainly for development overseas",
                    "For individual emerging or early-career artists developing their practice.",
                    disciplines=["all"], career=["emerging"], citizenship="Australian citizen or permanent resident.",
                    age="18 or older", applicantTypes=["individual"],
                    qualifications="Formal arts qualifications are optional.",
                    specialistCriteria="Applicants need an Australian bank account in their own name."),
        timing(override_status(text, status), opening=opening, deadline=deadline, commencement=commencement),
        "Funding for early-career artists to develop their practice, primarily through opportunities overseas.",
        uncertainties="Check the funder’s guidelines for eligible expenses and the contribution expected for your project.",
    )]


def pkf(url, html, _now, _supporting_html=None):
    text = page_text(html)
    require(r"Artists throughout the world are encouraged to apply", text)
    require(r"minimum of 10 exhibitions within the past 10 years", text)
    require(r"Painting Sculpture Works on paper \(including printmaking\)", text)
    require(r"Use of funds\s*:\s*Unrestricted", text)
    require(r"Grant period\s*:\s*Intended for one year", text)
    require(r"Cover letter Artist statement Current resume or CV", text)
    require(r"10 digital images of recent work", text)
    require(r"professional references", text)
    cap = amount(require(rf"Grant amount\s*:\s*Up to {MONEY}", text)[1])
    apply_url = application(html, url, "bbgm-apply.yourcausegrants.com", r"/apply/programs/[a-f0-9-]+/?")
    rolling = bool(re.search(r"Application deadline\s*:\s*None \(rolling application\)", text, re.I))
    if not rolling and override_status(text, "unknown") == "unknown":
        raise ValueError("rolling deadline evidence missing")
    return [entry(
        "rolling", "Pollock-Krasner Foundation Grant", url, apply_url,
        ["artist-grant", "materials-equipment", "studio-workspace"],
        money(cap, "USD", conditions="The grant is unrestricted. The award depends on the artist’s circumstances."),
        eligibility("international", "Worldwide · Australian artists can apply",
                    "For professional visual artists with an established exhibition record in eligible media.",
                    disciplines=["painting", "sculpture", "printmaking", "works-on-paper"], career=["established"],
                    applicantTypes=["individual"],
                    specialistCriteria="At least 10 eligible professional exhibitions in the past 10 years."),
        timing(override_status(text, "open" if rolling and apply_url else "unknown"), rolling=rolling, duration="Intended for one year"),
        "Unrestricted funding to sustain the practice of professional visual artists.",
        applicationRequirements="Apply online with a cover letter, artist statement, exhibition CV, ten recent work images, an image list and three professional references.",
        selectionCriteria="The panel considers professional exhibition and award history and places weight on the submitted images.",
        restrictions="Primary media are painting, sculpture and works on paper. Review the funder’s excluded practices and student rules.",
    )]


WYNDHAM_DETAIL = r"/services/arts-culture/residencies-commissions-grants/\d{4}-wyndham-arts-grants/?"


def wyndham(url, html, now, _supporting_html=None):
    text = page_text(html)
    year = require(r"\b(\d{4}) Wyndham Arts Grants\b", text)[1]
    if not re.fullmatch(WYNDHAM_DETAIL, urlsplit(url).path) or f"/{year}-" not in urlsplit(url).path:
        raise ValueError("Wyndham round title and detail URL disagree")
    opening = require(rf"Applications open:\s*(\d{{1,2}}:\d{{2}}[ap]m),\s*\w+ ({MONTH_DATE})", text)
    closing = require(rf"Applications close:\s*(\d{{1,2}}:\d{{2}}[ap]m),\s*\w+ ({MONTH_DATE})", text)
    opens_at = local_instant(local_date(opening[2]), opening[1])
    deadline = local_instant(local_date(closing[2]), closing[1])
    require(r"Grants for Creative Development and Skills Development are open to applicants who live in Wyndham", text)
    require(r"Grants for Presentation are open to artists based in or outside of Wyndham, with all presentation outcomes taking place within Wyndham City", text)
    require(r"across all creative genres", text)
    apply_url = application(html, url, "wyndham.smartygrants.com.au", r"/[A-Za-z][A-Za-z0-9_-]*")
    status = calendar_status(now.astimezone(ZoneInfo(MELBOURNE)).date(), opens_at.date(), deadline, now, apply_url)
    if now < opens_at and status != "closed":
        status = "forthcoming"
    records = []
    for stream, key, categories, summary in [
        ("Creative Development", "creative-development", ["artist-grant", "research-experimental"],
         "Supports research, testing and development of new creative work for future presentation."),
        ("Skills Development", "skills-development", ["artist-grant", "professional-development"],
         "Supports artists learning new skills or developing techniques for their creative practice."),
        ("Presentation", "presentation", ["artist-grant", "exhibition-opportunity"],
         "Supports presentation of new creative work in Wyndham, across art forms."),
    ]:
        cap = amount(require(rf"\b{stream} Up to {MONEY}", text)[1])
        resident = key != "presentation"
        criteria = ("Applicants must live in Wyndham. A group’s applicant must be a Wyndham resident." if resident
                    else "Artists may be based outside Wyndham. All funded presentation outcomes must take place in Wyndham.")
        records.append(entry(
            f"{year}-{key}", f"Wyndham Arts Grants · {stream} {year}", url, apply_url, categories,
            money(cap, "AUD"),
            eligibility("municipality", "Wyndham, Victoria" if resident else "Projects in Wyndham, Victoria", criteria,
                        state="VIC", municipality="Wyndham", disciplines=["all"], applicantTypes=["individual", "group"],
                        residency="Wyndham residents." if resident else None,
                        geographicConfidence="confirmed" if resident else "potential"),
            timing(override_status(text, status), opening=opens_at.date(), opens_at=opens_at, deadline=deadline),
            summary, uncertainties="See the council guidelines for stream rules, eligible costs and the application checklist.",
        ))
    return records


def creative_portal_application(url, html):
    portal = "https://australiacouncil.fluxx.io/user_sessions/new"
    return portal if any(link.rstrip("/") == portal and label.casefold() == "apply now"
                         for link, label in links(html, url)) else None


def creative_australia(url, html, now, _supporting_html=None):
    text = page_text(html)
    require(r"Arts Projects for Individuals and Groups", text)
    deadline_pattern = rf"(?:\w+ )?({MONTH_DATE}) at (\d{{1,2}}(?::\d{{2}})?[ap]m) \((AEDT|AEST)\)"
    current = require(rf"Key dates Applications close:\s*{deadline_pattern}", text)
    future = re.search(rf"Future closing dates {deadline_pattern}", text, re.I)
    minimum, maximum = require(rf"You can apply for between {MONEY} to {MONEY}", text).groups()
    require(r"Australian citizen or an Australian permanent resident", text)
    require(r"Access costs are legitimate expenses", text)
    require(r"Only individuals and groups may apply", text)
    commencement = re.search(rf"Supported activity:\s*from ({MONTH_DATE})", text, re.I)
    apply_url = creative_portal_application(url, html)
    records = []
    for match in filter(None, [current, future]):
        clock = re.sub(r"^(\d{1,2})(?=[ap]m)", r"\1:00", match[2], flags=re.I)
        deadline = local_instant(local_date(match[1]), clock)
        if deadline.tzname() != match[3].upper():
            raise ValueError("published deadline zone conflicts with eastern Australia local time")
        future_round = match is future
        if now >= deadline:
            status = "closed"
        elif future_round:
            status = "forthcoming"
        else:
            status = "open" if apply_url else "unknown"
        current_program = eligibility(
            "national", "Australia-wide",
            "For practising artists and arts professionals applying as individuals or groups.",
            disciplines=["all"], applicantTypes=["individual", "group"],
            citizenship="Australian citizen or permanent resident.",
            accessibility="Access costs can be included in the application budget.",
        )
        future_program = eligibility(
            "national", "Australia-wide · confirm round eligibility",
            "The funder has announced a deadline. Round-specific guidelines are pending.",
            geographicConfidence="potential",
        )
        financial = (money(None, None, funding_type="unknown") if future_round
                     else money(amount(maximum), "AUD") | {"minimum": amount(minimum)})
        record = entry(
            deadline.strftime("%Y-%m"), f"Arts Projects for Individuals and Groups · {deadline:%B %Y}",
            url, None if future_round else apply_url, ["artist-grant"], financial, future_program if future_round else current_program,
            timing(override_status(text, status) if not future_round else status, deadline=deadline,
                   commencement=local_date(commencement[1]) if commencement and not future_round else None),
            "Creative Australia’s project grants for individual artists and groups across arts practices.",
            uncertainties=("The opening date, application link and terms for this round are awaiting publication."
                           if future_round else None),
        )
        if future_round:
            record["verificationStatus"] = "partially-verified"
        records.append(record)
    return records


def music_australia(url, html, now, _supporting_html=None):
    text = page_text(html)
    require(r"International Professional and Artistic Development fund \(Category 2\)", text)
    dates = require(
        rf"Key dates Applications close:\s*\w+ ({MONTH_DATE}) at (\d{{1,2}}(?::\d{{2}})?[ap]m) \((AEDT|AEST)\)",
        text,
    )
    clock = re.sub(r"^(\d{1,2})(?=[ap]m)", r"\1:00", dates[2], flags=re.I)
    deadline = local_instant(local_date(dates[1]), clock)
    if deadline.tzname() != dates[3].upper():
        raise ValueError("published Music Australia deadline zone conflicts with eastern Australia local time")
    minimum, maximum = require(rf"supports international professional development activity with matched funding of {MONEY} to {MONEY}", text).groups()
    require(r"Australian citizens or permanent residents who are practising contemporary music artists", text)
    require(r"emerging, breakthrough and established acts", text)
    require(r"matched funding that is equal to or greater than the grant request", text)
    require(r"You cannot use in-kind \(non-financial\) contributions for matched funding", text)
    require(r"You cannot use other federal, state or local government grant sources for matched funding", text)
    require(r"registered in our application management system a minimum of two business days prior", text)
    apply_url = creative_portal_application(url, html)
    status = "closed" if now >= deadline else "open" if apply_url else "unknown"
    return [entry(
        deadline.strftime("%Y-%m"), f"International Professional and Artistic Development · {deadline:%B %Y}",
        url, apply_url, ["artist-grant", "professional-development", "travel-mobility"],
        money(amount(maximum), "AUD", funding_type="partial",
              co_contribution="Applicants must match the requested grant amount with eligible cash funding.",
              conditions="In-kind contributions and Australian government grants cannot count towards the match.")
        | {"minimum": amount(minimum)},
        eligibility("national", "Australia-wide · for activity overseas",
                    "For practising contemporary musicians across career stages, including solo artists and groups.",
                    disciplines=["music"], career=["emerging", "breakthrough", "established"],
                    citizenship="Australian citizen or permanent resident.", applicantTypes=["individual", "group"]),
        timing(override_status(text, status), deadline=deadline),
        "Matched funding for international professional development by Australian contemporary music artists.",
        applicationRequirements="Register for the application portal at least two business days before the deadline. Include evidence of matched funding.",
        uncertainties="Confirm the activity window and eligible expenses in the official guidelines.",
    )]


RAMSAY_TERMS = r"/whats-on/ramsay-art-prize/ramsay-art-prize-(\d{4})-terms-and-conditions/?"
SUBMITTABLE_ID = r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}"
ADELAIDE = "Australia/Adelaide"
NEW_YORK = "America/New_York"


def ramsay_terms_url(url, html):
    matches = {link for link, label in links(html, url)
               if label == "Terms and Conditions" and urlsplit(link).scheme == "https"
               and urlsplit(link).netloc == urlsplit(url).netloc
               and re.fullmatch(RAMSAY_TERMS, urlsplit(link).path, re.I)}
    if len(matches) != 1:
        raise ValueError("expected one first-party link to the current Ramsay entry terms")
    return next(iter(matches))


def ramsay(url, html, now, supporting_html=None):
    text, terms = page_text(html), page_text(supporting_html or "")
    year = re.fullmatch(RAMSAY_TERMS, urlsplit(ramsay_terms_url(url, html)).path, re.I)[1]
    require(rf"Ramsay Art Prize {year} - Terms & Conditions", terms)
    dates = require(
        rf"Submissions to the Ramsay Art Prize {year} must be uploaded .*? between the hours of "
        rf"(\d{{1,2}}\.\d{{2}}[ap]m), (\d{{1,2}} [A-Za-z]+) and (\d{{1,2}}\.\d{{2}}[ap]m),"
        rf" ({MONTH_DATE}) \(Adelaide, South Australia, local time\)",
        terms,
    )
    close_day = local_date(dates[4])
    opens_at = local_instant(local_date(f"{dates[2]} {close_day.year}"), dates[1].replace(".", ":"), ADELAIDE)
    deadline = local_instant(close_day, dates[3].replace(".", ":"), ADELAIDE)
    require(rf"Entries for the Ramsay Art Prize {year} open on {dates[2]} and close {dates[4]}", text)
    age = require(r"entrant must be under the age of (\d+) and over the age of (\d+)", terms)
    require(r"Australian citizens or permanent residents and must be living in Australia as their primary place of residence", terms)
    require(r"Duos or art collectives are eligible to enter", text)
    require(r"working in any medium", text)
    require(r"Submissions are limited to one entry per person or collective", terms)
    require(r"submitted entry must be new or recent work", terms)
    require(r"entry must be original", terms)
    require(r"work of art submitted must be unique and non-editioned", terms)
    require(r"full ownership of the submitted entry \(but not copyright\) will be transferred", terms)
    require(r"perpetual, royalty-free, non-exclusive licence", terms)
    require(r"independent legal advice, at their own cost", terms)
    fee = amount(require(rf"Entry into the Ramsay Art Prize will incur a {MONEY} administration fee, including GST", terms)[1])
    headline_fee = amount(require(rf"An administration fee of {MONEY} \(inc\. GST\) is applicable", text)[1])
    prize = amount(require(rf"will pay the Ramsay Art Prize {year} winner {MONEY} \(GST exclusive\)", terms)[1])
    headline_prize = amount(require(rf"A {MONEY} art prize", text)[1])
    if fee != headline_fee or prize != headline_prize:
        raise ValueError("Ramsay entry terms and programme page disagree on amounts")
    apply_url = application(html, url, "forms.sa.gov.au", r"/form/[a-f0-9]{24}/?")
    if now >= deadline:
        status = "closed"
    elif now < opens_at:
        status = "forthcoming"
    else:
        status = "open" if apply_url else "unknown"
    return [entry(
        year, f"Ramsay Art Prize {year}", url, apply_url, ["prize-award"],
        money(
            prize, "AUD",
            conditions=("The gallery acquires the winning work, and the winner retains copyright. Entrants grant "
                        "a perpetual, royalty-free, non-exclusive licence for uses specified in the entry terms."),
        ) | {
            "minimum": prize, "applicationFee": {"amount": fee, "currency": "AUD"},
            "otherCosts": "The winner must obtain independent legal advice at their own expense.",
        },
        eligibility("national", "Australia-wide", "For artists working in any medium. Solo artists, duos and collectives may enter.",
                    citizenship="Australian citizen or permanent resident.",
                    residency="Australia must be the applicant’s primary place of residence.",
                    age=f"Over {age[2]} and under {age[1]} on the closing date.", applicantTypes=["individual", "group"]),
        timing(override_status(text, status), opening=opens_at.date(), opens_at=opens_at, deadline=deadline),
        "An acquisitive prize for contemporary Australian art. Finalists exhibit at the Art Gallery of South Australia.",
        restrictions="One entry per artist or collective. The work must be original, recent, unique and non-editioned.",
    )]


def gottlieb_eligibility(supporting_html, years):
    text = page_text(supporting_html or "")
    require(r"The Foundation’s grant programs are open to both US-based and international artists\.", text)
    require(r"US citizenship or residency is not required", text)
    return eligibility(
        "international", "Worldwide · Australian artists can apply",
        "For individual painters, sculptors and printmakers who meet the programme’s experience and financial-need criteria.",
        disciplines=["painting", "sculpture", "printmaking"], career=["established"], applicantTypes=["individual"],
        citizenship="US citizenship and residence are optional.",
        specialistCriteria=f"At least {years} years of work at a mature stage of artistic practice.",
    )


def gottlieb_emergency(url, html, _now, supporting_html=None):
    text = page_text(html)
    eligible = gottlieb_eligibility(supporting_html, 10)
    require(r"minimum involvement of ten years in a mature phase", text)
    require(r"Artists must work in the disciplines of painting, sculpture or printmaking", text)
    require(r"unforeseen, catastrophic incident", text)
    require(r"once this budgetary limit has been reached", text)
    require(r"does not consider requests for dental work, chronic situations, capital improvements, or projects", text)
    require(r"general indebtedness or lack of employment", text)
    cap = amount(require(rf"The maximum amount of this grant is {MONEY}", text)[1])
    rolling = bool(re.search(r"This program has no deadlines", text, re.I))
    status = override_status(text, "unknown")
    if not rolling and status == "unknown":
        raise ValueError("rolling deadline evidence missing")
    apply_url = application(html, url, "gottliebfoundation.submittable.com",
                            rf"/submit/{SUBMITTABLE_ID}/emergency-grant-application/?")
    if status == "unknown" and rolling and apply_url:
        status = "open"
    return [entry(
        "rolling", "Gottlieb Foundation Emergency Grant", url, apply_url, ["emergency-assistance", "artist-grant"],
        money(cap, "USD", conditions="Awards are one-off for a particular emergency and subject to the foundation’s annual programme budget."),
        eligible, timing(status, rolling=rolling),
        "Short-term financial help for artists facing an unexpected emergency they cannot afford, such as fire, flood or emergency medical costs.",
        restrictions="The grant excludes chronic issues, projects, general debt and loss of employment.",
    )]


def gottlieb_individual(url, html, now, supporting_html=None):
    text, faq = page_text(html), page_text(supporting_html or "")
    eligible = gottlieb_eligibility(supporting_html, 20)
    require(r"painters, sculptors, and printmakers who have worked in a mature phase of art for 20 years or more", text)
    require(r"eligibility for an Individual Support Grant is determined by the applicant’s current financial need", text)
    require(r"International applicants must provide a complete tax return", faq)
    require(r"submitted images must begin in \d{4} or earlier and cover the years between then and now", faq)
    us_date = r"[A-Za-z]+ \d{1,2}, \d{4}"
    cycle = require(
        rf"Applications for the (\d{{4}}) grant cycle will be accepted beginning ({us_date})\."
        rf" The deadline to apply is ({us_date}) at 11:59 Eastern Time", text,
    )
    opening = datetime.strptime(cycle[2], "%B %d, %Y").date()
    deadline = local_instant(datetime.strptime(cycle[3], "%B %d, %Y").date(), "11:59pm", NEW_YORK)
    require(rf"before midnight Eastern Standard Time on {re.escape(cycle[3])}", faq)
    if deadline.tzname() != "EST" or deadline.year != int(cycle[1]):
        raise ValueError("Gottlieb application dates disagree with the published cycle or local time")
    apply_url = application(html, url, "gottliebfoundation.submittable.com", rf"/submit/{SUBMITTABLE_ID}/view/?")
    status = calendar_status(now.astimezone(ZoneInfo(NEW_YORK)).date(), opening, deadline, now, apply_url)
    return [entry(
        cycle[1], f"Gottlieb Foundation Individual Support Grant · {cycle[1]}", url, apply_url, ["artist-grant"],
        money(None, "USD"),
        eligible, timing(override_status(text, status), opening=opening, deadline=deadline),
        "Financial support for established visual artists with demonstrated financial need.",
        applicationRequirements="International applicants need a complete tax return and a portfolio documenting the required period of practice.",
        uncertainties="The funder describes previous award amounts. The amount for this cycle is unpublished.",
    )]


ADAPTERS = {
    "potter": potter, "pkf": pkf, "wyndham": wyndham, "creative-australia": creative_australia,
    "music-australia": music_australia, "ramsay": ramsay, "gottlieb-emergency": gottlieb_emergency,
    "gottlieb-individual": gottlieb_individual,
}
