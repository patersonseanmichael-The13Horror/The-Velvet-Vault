(function initAtomicSpin(globalScope) {
  function resolveSlotServerUrl(value) {
    const raw = String(value || "").trim();
    return raw.replace(/\/+$/, "");
  }

  function nextRoundId() {
    if (globalScope.crypto && typeof globalScope.crypto.randomUUID === "function") {
      return globalScope.crypto.randomUUID();
    }
    return `round_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function toInt(value, min = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.floor(parsed));
  }

  async function atomicSpin({
    VaultEngine,
    auth,
    slotServerUrl,
    machineId,
    stakeCents,
    roundId,
    spinSessionId,
    clientSeed,
    featureState,
    freeSpin
  }) {
    if (!VaultEngine || typeof VaultEngine.reserveBet !== "function" || typeof VaultEngine.settleBet !== "function" || typeof VaultEngine.cancelBet !== "function") {
      throw new Error("Atomic wallet methods unavailable.");
    }

    const normalizedBaseUrl = resolveSlotServerUrl(slotServerUrl);
    if (!normalizedBaseUrl) {
      throw new Error("Slot server not configured.");
    }

    const currentUser = auth?.currentUser;
    if (!currentUser || typeof currentUser.getIdToken !== "function") {
      throw new Error("Please sign in.");
    }

    const finalRoundId = String(roundId || nextRoundId()).trim();
    const finalSpinSessionId = String(
      spinSessionId ||
      (globalScope.crypto && typeof globalScope.crypto.randomUUID === "function"
        ? globalScope.crypto.randomUUID()
        : `spin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`)
    ).trim();
    const reserveAmount = freeSpin ? 0 : toInt(stakeCents, 0);

    await VaultEngine.reserveBet({
      roundId: finalRoundId,
      amount: reserveAmount,
      meta: { game: "slots", machineId, spinSessionId: finalSpinSessionId }
    });

    try {
      const token = await currentUser.getIdToken(true);
      const response = await fetch(`${normalizedBaseUrl}/spin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          machineId,
          stake: toInt(stakeCents, 0),
          roundId: finalRoundId,
          spinSessionId: finalSpinSessionId,
          clientSeed: String(clientSeed || ""),
          ...(featureState ? { state: featureState } : {})
        })
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload || payload.error || !payload.outcome) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `Slot server error (${response.status})`);
      }

      const payout = Math.max(0, toInt(payload?.outcome?.totalPayout ?? payload?.outcome?.totalWin, 0));
      await VaultEngine.settleBet({
        roundId: finalRoundId,
        payout,
        meta: {
          game: "slots",
          machineId,
          spinSessionId: finalSpinSessionId,
          resultHash: payload?.audit?.resultHash ?? payload?.audit?.hash ?? null
        }
      });

      return {
        ok: true,
        roundId: finalRoundId,
        spinSessionId: finalSpinSessionId,
        ...payload
      };
    } catch (error) {
      try {
        await VaultEngine.cancelBet({ roundId: finalRoundId, reason: "spin_failed" });
      } catch {}
      try {
        await VaultEngine.logClientEvent?.({
          type: "spin_error",
          message: error?.message || "Spin failed.",
          meta: {
            roundId: finalRoundId,
            spinSessionId: finalSpinSessionId,
            machineId
          }
        });
      } catch {}
      throw error;
    }
  }

  globalScope.VVAtomicSpin = {
    atomicSpin,
    resolveSlotServerUrl
  };
})(window);
