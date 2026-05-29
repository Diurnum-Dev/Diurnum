Probably **not compatible with a closed-source bundled app** if Ledgerly directly ships or links Beancount as part of the application.

Beancount is currently distributed under **GNU GPLv2 only**. The official Beancount repository says: “This code is distributed under the terms of the ‘GNU GPLv2 only’,” and PyPI lists Beancount’s license as `GPL-2.0-only`. ([GitHub](https://github.com/beancount/beancount?utm_source=chatgpt.com "GitHub - beancount/beancount: Beancount: Double-Entry Accounting from Text Files."))

That does **not** mean Ledgerly is impossible. It means we need to be careful about how Ledgerly uses Beancount.

## Practical implications

If Ledgerly is going to be **open source under GPLv2-compatible terms**, then using Beancount directly is much easier.

If Ledgerly is going to be **commercial/proprietary**, then directly bundling Beancount inside the macOS app as a Python sidecar or importing it as a library is legally risky. GPLv2 generally requires that distributed derivative/combined works be licensed under the GPL, so shipping Beancount as part of a proprietary desktop app is likely not acceptable without legal review or a separate license from the copyright holder.

## Safer architecture options

### Option 1: User-installed Beancount

Ledgerly does not ship Beancount. Instead, it detects a user-installed Beancount CLI/library.

```text
Ledgerly app
  → calls user-installed beancount
  → reads/writes .bean files
```

This is likely safer because Ledgerly is not distributing Beancount. Downsides: worse onboarding, version mismatch, support burden.

### Option 2: Use Beancount format but implement your own parser/engine

Ledgerly supports the Beancount **file format**, but does not include Beancount code.

```text
Ledgerly app
  → own parser/indexer/reporter
  → reads/writes Beancount-compatible files
```

This is probably the cleanest proprietary path long-term. File formats are generally not copyrighted in the same way code is, though exact grammar/docs/code reuse needs care. You’d want to implement from the spec/behavior without copying Beancount code.

### Option 3: Make Ledgerly GPL/open source

This fits the Beancount ecosystem and lets you bundle/use Beancount much more naturally.

The business model could still be commercial:

```text
Free/open app
Paid sync
Paid hosted AI
Paid bank feeds
Paid collaboration
Paid support
```

But the app code that incorporates Beancount would likely need to be GPL-compatible.

### Option 4: Ask Martin Blais about commercial licensing

If Ledgerly wants to bundle Beancount in a proprietary product, ask the maintainer/copyright holder whether dual licensing is possible. The repo lists Martin Blais as author/copyright holder. ([GitHub](https://github.com/beancount/beancount?utm_source=chatgpt.com "GitHub - beancount/beancount: Beancount: Double-Entry Accounting from Text Files."))

## My recommendation

For Ledgerly, I’d avoid making Beancount the embedded runtime dependency unless you are comfortable open-sourcing the desktop app under GPLv2-compatible terms.

The best proprietary-friendly architecture is probably:

```text
Ledgerly
  owns the UX, import pipeline, review workflow, sync, AI, reports

Beancount format
  is the durable ledger format

Ledgerly engine
  implements the subset of Beancount needed for MVP

Optional integration
  can call an external user-installed Beancount for validation
```

So the revised plan would be:

1. **Do not bundle Beancount in the app initially.**
    
2. **Write Ledgerly’s own parser/validator for a constrained Beancount subset.**
    
3. **Offer optional external Beancount validation if installed.**
    
4. **Keep `.bean` export/import compatible.**
    
5. **Decide later whether the app itself should be GPL/open-source or whether to pursue dual licensing.**
    

For the MVP, the safest product posture is:

> “Ledgerly uses Beancount-compatible plain-text files as its ledger format.”

not:

> “Ledgerly embeds Beancount under the hood.”

I’d run this by an open-source licensing attorney before distributing a paid/proprietary build, but the headline answer is: **GPLv2-only is a serious constraint for a proprietary bundled Ledgerly app.**