# The LinkedIn button was the easy part

Ghosted got LinkedIn sign-in today. That part was a browser tab, two variables
and a click.
Everything interesting happened underneath, and most of it was wrong before it
was right.

Two releases went out — 1.3.0 for the feature, 1.3.1 for a legal line and a
packaging decision — and this is the write-up of the parts worth remembering,
including the two arguments I lost.

## The provider was already wired

The LinkedIn provider has been in `lib/auth.ts` since early on, gated behind
`AUTH_LINKEDIN_ID` and `AUTH_LINKEDIN_SECRET`, with a button that only renders
when both are set. So "add LinkedIn login" was never a feature request. It was a
credential request: a developer app, a LinkedIn Page to own it (the association
is permanent, you cannot move an app to another page later), a redirect URL
registered exactly, and the OpenID Connect product added to the app.

The unknown was whether the flow would survive Auth.js's validation at all. The
provider is OIDC, and LinkedIn's own documentation says the ID token's `iss` is
`https://www.linkedin.com` while its discovery document says
`https://www.linkedin.com/oauth`. Auth.js checks that value strictly, and the
mismatch has broken other stacks. It didn't break here — the token agrees with
discovery now — but I only knew that after the first real sign-in, not from
reading.

## The identity that was different every time

Here is the bug that mattered, and no test would have caught it.

Auth.js writes the provider's subject id into `account.providerAccountId`, and it
fills `user.id` with something else: a fresh `crypto.randomUUID()` on every single
sign-in. Its source says so, with a comment explaining that the profile id lives
on the account instead. Ghosted had been keying identities on `user.id`.

Read that again as a sequence. A member signs in with Google: no identity matches
(the key is new), so the code falls back to email, finds them, and *rewrites* the
provider columns on the user row. They sign in with LinkedIn next: same story,
and now the account says LinkedIn and nothing remembers Google. A member whose
provider shares no email gets worse than that — a new account on every sign-in.

I found it while writing the gate that refuses sign-ins on a closed instance,
because that gate has to classify a sign-in *before* anything is written, which
meant reading the library properly instead of trusting the shape of the object I
had been handed for months.

The fix is one line in two callbacks, plus a migration that deletes the identity
rows written the wrong way. Nothing reads them, and a returning member is matched
by verified email on their next sign-in and re-linked with the real subject id —
which is exactly what happened on the first LinkedIn sign-in after the fix, a
ten-character string where a UUID used to be.

## One column pretending to be a table

`users.provider` was doing two jobs: how the account was created, and which
provider it belongs to. Only one of those is a single value, so the second
provider to arrive overwrote the first. "Which accounts are connected?" had no
answer that the database could give.

Now there is an `oauth_accounts` table — one row per linked identity, unique on
provider plus subject id — backfilled from what was there. `users.provider` means
what it says: how the account was made. Settings grew a Connected accounts panel
that shows what is linked and offers a Connect button for what is not, with the
sentence that explains the thing people trip over: signing in with Google or
LinkedIn attaches to your account when the email matches, it does not create a
second one.

## The two arguments I lost

The first one was mine to explain and his to decide. When a provider takes over
an *unverified* account — the address was registered but never confirmed — the
old code dropped the password. Reasonable: whoever registered it never proved
they owned the mailbox, so their credential should not survive the real owner's
first provider sign-in.

He asked why the password had to go at all, and while answering I found the real
bug: there was no way to set a password again. Changing one requires the current
password, and the reset flow only issues a token for an account that has one, so
an account that lost its password to that rule was stuck as provider-only
forever. The rule stayed, the dead end went: Settings offers *Set a password* for
any account without one, and the dashboard says once, in a dismissible notice,
that the password was removed and why.

The second argument I lost outright. An instance with `ALLOW_REGISTRATION=false`
should not show the provider buttons, I said — you seed your own users, you have
no reason to register an OAuth app, and the buttons only create confusion.
Except: an instance can run with sign-ups open for a while, collect accounts, and
close them later. Some of those accounts have no password. Hiding the buttons
locks their owners out of their own data, on a flag that was supposed to be about
strangers. So the buttons follow the credentials, and the flag only refuses the
*account* — a sign-in with nothing behind it gets a sentence pointing at the
operator, and the env documentation got shorter again.

## A checkbox would have made it worse

He asked whether the registration form needs a terms checkbox. It does not, and
adding one would have been the riskier choice.

A privacy policy is information the controller owes under Art. 13 GDPR, not
something to be accepted; account data is processed to perform the contract
(Art. 6(1)(b)), not on consent. A mandatory "I agree to the privacy policy" tick
suggests the opposite, and the German DSK and the EDPB's WhatsApp decision both
treat a blurred accept button as misleading. Terms are different — they genuinely
need to become part of the contract — but they get there by being pointed at
where the account is created, with a chance to read them; a footer link alone was
held insufficient (OLG Frankfurt, 6 U 121/21).

So the auth screens now carry one line under the box: by creating an account or
signing in you agree to the Terms of Service and the Privacy Policy, both linked.
Not a checkbox, and not a modal.

## What I deliberately did not ship

The release instructions said to publish a prebuilt container image, and I had a
workflow ready to do it on every tag. It is not going out.

`NEXT_PUBLIC_APP_URL` is baked at build time — it is the canonical URL, the
`og:url`, the JSON-LD `url`, the links in verification and reset email, and the
origin in the analytics policy. A shared image would ship *this* instance's
identity to someone else's server. Their users would get password-reset links
pointing at my domain. It is a failure you find out about from somebody else's
inbox, months later, so it is not worth the convenience. Self-hosters build their
own image, which is what the docs told them to do anyway, and the commented
`image:` line in the compose file is gone rather than waiting to be uncommented.

## The things that went wrong quietly

Two, and both are in the release notes rather than rounded off.

The first full end-to-end run failed one accessibility test: the board came back
`hidden` because the dashboard believed the account was empty, a timing flake
rather than a regression. It passed on its own, and the full rerun was clean. The
release commit says exactly that instead of "all green", because the difference
between a flake and a bug is a thing you only learn by looking.

Staging did not redeploy when staging was pushed. It sat on the old version while
CI went green, so the release went out on the strength of
the CI job that builds the shipped Dockerfile and boots the whole compose stack
against a fresh Postgres — which is a real check, but it is not the same as a
cloud environment answering requests, and I said so before merging to `main`
rather than after.

## What is next

The FAQ still promises an MCP integration that does not exist. That is the
honest next feature.

And the smaller one this release paid for: the OAuth rules used to live in a JWT
callback where nothing could reach them. They are a service now — classify,
decide, then write — which is why the gates above have tests at the boundary
instead of stories in a commit message.

---

*Ghosted is hand-written and AI-enhanced: the specification, the decisions, the
taste and the final read are mine; the implementation was written with DeepSeek
V4.1 Flash in the DeepSeek Harness. This post is the same — the failures above
are the ones the tooling and I actually hit, reported in the order they
happened.*
