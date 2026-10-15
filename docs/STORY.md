# The Ghosted story

**Ghosted is a free, open-source, self-hosted job application tracker I built
during my own job hunt.** Ghosting and hundreds of applications have become the
baseline of looking for work, and I wanted a logbook of my own that wasn't a
spreadsheet, an inbox, or somebody's subscription funnel.

My good friend was job hunting for months before me, and he couldn't paint a
positive picture of the situation. He applied to 500+ places. So as I was coming
back from a mental sabbatical, I knew exactly what kind of "Hunger Games" I was
joining.

Hundreds of applications. Template rejections. And long stretches of nobody
answering at all.

The idea took root a few months back. I wanted something super simple, with no
bloat and easy self-hosting, but a bit more nuanced than a spreadsheet or tagging
emails. There are plenty of subscription-based "booster" services with tracking
baked in, mostly for the applications you sent through them. And then there's
LinkedIn's built-in tracker, which I don't even want to talk about. Seriously.

I'd been turning the idea over for a few weeks when I wrote the first project
brief in late August 2026, and I logged the first real application with it on
September 3. That first one ghosted me too. Of course it did.

I built it organically, based on whatever was missing or in my way while logging
my own applications. At some point it stopped being a personal project and became
something I wanted to share, because I'm pretty sure I'm not the only one with
this problem. From there the vision was clear.

**Free of charge.** I can't imagine anything more disgusting than ripping off
actual unemployed people in today's job market.

**Open source.** It's built on open-source pieces I didn't have to reinvent, you
can self-host it, and you can do whatever you like with it.

**Honest.** No selling your data, no third-party trackers, no ads. Your
applications live in one Postgres — yours if you self-host it, mine if you use
the hosted instance. The only counter is anonymized visit counts from my own
self-hosted Umami.

It's hand-written and AI-enhanced, and I'd rather name the tools than hand-wave
it. Mostly DeepSeek V4 and V4.1 Flash in DeepSeek Harness, with GLM-5.3 running
the security passes, and Claude Sonnet 5 and GPT-6 Sol reading a few diffs. The
architecture, the design, and the product decisions are mine — every change was
read, tested, and committed by hand.

I learned a lot in these months, and I'll keep learning. Software architecture,
DevOps and hosting, performance, security auditing. And the best one: how to stay
true to the vision without adding bloat.

Is it perfect? Nothing is. Is it the best solution? Certainly not. I made it for
myself, and for anyone who thinks it's valuable.

If you know someone deep in a job hunt who could use it, send it their way.
Ghosted is at [ghosted.boo](https://ghosted.boo), and the source is this
repository — MIT, issues and PRs welcome, and I'm open to anything that polishes
it further.
