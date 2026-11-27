# Aurelia Arena Security Specification (Production Upgrade)

## 1. Core Data Invariants
1. **Split Balance Integrity**: `publicProfiles/{uid}.balance == depositBalance + winningBalance + bonusBalance`. Only `winningBalance` is eligible for withdrawal requests.
2. **Unique UTR Lock**: Every 12-digit UTR number in `upiUtrs/{utr}` can only be created once and must atomically co-exist with `upiRequests/{requestId}` (`existsAfter`). Duplicate UTR submissions always fail.
3. **Withdrawal Cooldown & Daily Cap**: Non-admin withdrawal requests enforce a 5-minute (`300000ms`) cooldown via `users/{uid}.lastWithdrawalAtMs` and a `50,000` coin daily cap via `users/{uid}.dailyWithdrawnTotal`, mirrored in `server.ts`.
4. **Admin Settlement Exclusivity**: Only verified admins (`isAdmin()`) can transition `upiRequests/{requestId}` from `pending` to `approved` or `rejected`, or write `upi_deposit` / `admin_adjust` wallet transactions.
5. **Referral First-Game Gate**: `referrals/{referralId}` always starts as `pending`, can only transition `pending -> unlocked` by the referred user upon completing a real game, and `unlocked -> claimed` by the referrer. Self-referrals (`referrerUid == referredUid`) are blocked.
6. **Ludo Terminal State Lock**: Finished Ludo rooms (`status == 'finished'`) cannot be mutated by non-admin players.

## 2. Adversarial Payloads Verified Denied (Dirty Dozen)
1. Shadow field injection (`isAdmin: true` on `publicProfiles` or `users`) -> DENIED via `hasOnly`.
2. Duplicate UTR deposit replay (`upiUtrs/{existingUtr}`) -> DENIED because `update` is `false` and `create` fails on existing doc.
3. Self-approval of own UPI deposit (`upiRequests/{id}` `status: 'approved'` by non-admin) -> DENIED (`allow update: if isAdmin()`).
4. Spoofing `upi_deposit` wallet transaction by regular user -> DENIED (`incoming().type != 'upi_deposit'`).
5. Exceeding daily withdrawal cap (`dailyWithdrawnTotal: 60000`) -> DENIED (`<= 50000`).
6. Bypassing withdrawal cooldown (`lastWithdrawalAtMs` delta < 300000ms) -> DENIED.
7. Self-referral creation (`referrerUid == request.auth.uid`) -> DENIED.
8. Premature referral claim (`status: 'pending' -> 'claimed'` skipping `'unlocked'`) -> DENIED.
9. Reading another user's private PII (`users/{otherUid}`) -> DENIED (`isOwner || isAdmin`).
10. Unverified email spoofing admin email -> DENIED (`isVerified()` requires `email_verified == true`).
11. Mutating finished Ludo room winner -> DENIED (`existing().status != 'finished'`).
12. Oversized ID / resource poisoning (`requestId` > 128 chars or invalid chars) -> DENIED via `isValidId`.
