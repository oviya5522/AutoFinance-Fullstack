import { useEffect, useState } from "react";
import { Check, LoaderCircle, X, AlertTriangle } from "lucide-react";
import {
  checkReLoanEligibility,
  getReLoanRules,
  saveReLoanEligibility,
} from "../../services/reloanStorage";

const ReLoanEligibilityModal = ({ loan, customer, vehicle, onClose, onViewResult }) => {
  // The rule set comes from the server, so the check runs once it arrives.
  const [result, setResult] = useState(null);
  const [visibleCount, setVisibleCount] = useState(0);

useEffect(() => {
  let cancelled = false;

  getReLoanRules().then(async (rules) => {
    if (!cancelled) {
      setResult(
        await checkReLoanEligibility({ customer, loan, vehicle, rules })
      );
    }
  });

  return () => {
    cancelled = true;
  };
}, [customer, loan, vehicle]);

  useEffect(() => {
    if (!result) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setVisibleCount((count) => {
        if (count >= result.checks.length) {
          window.clearInterval(timer);
          return count;
        }
        return count + 1;
      });
    }, 260);
    return () => window.clearInterval(timer);
  }, [result]);

  const complete = Boolean(result) && visibleCount >= result.checks.length;

  const handleViewResult = async () => {
    const saved = await saveReLoanEligibility(result);
    onViewResult(saved);
  };

  if (!result) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-[#0B6B43]">Admin Verification</p>
            <h2 className="mt-1 text-lg font-extrabold text-[#17221D]">Checking Re-loan Eligibility</h2>
            <p className="mt-1 text-xs text-slate-500">Please wait while we verify the customer's loan history and current eligibility.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50"><X size={16} /></button>
        </div>
        <div className="mt-5 space-y-2">
          {result.checks.map((check, index) => {
            const shown = index < visibleCount;
            const checking = index === visibleCount && !complete;
            return (
              <div key={check.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${shown ? "border-slate-200 bg-slate-50" : checking ? "border-[#CFE8D9] bg-[#F6FBF8]" : "border-slate-100 bg-white opacity-60"}`}>
                {checking ? <LoaderCircle size={15} className="animate-spin text-[#0B6B43]" /> : shown ? check.status === "pass" ? <Check size={15} className="text-emerald-600" /> : check.status === "pending" ? <AlertTriangle size={15} className="text-amber-600" /> : <X size={15} className="text-red-600" /> : <span className="h-3.5 w-3.5 rounded-full bg-slate-200" />}
                <div className="min-w-0 flex-1"><p className="text-xs font-bold text-[#17221D]">{check.label}</p><p className="text-[10px] text-slate-500">{checking ? "Checking..." : shown ? check.message : "Pending"}</p></div>
                {shown && <span className={`text-[9px] font-extrabold ${check.status === "pass" ? "text-emerald-700" : check.status === "pending" ? "text-amber-700" : "text-red-700"}`}>{check.status === "pass" ? "PASSED" : check.status === "pending" ? "PENDING" : "FAILED"}</span>}
              </div>
            );
          })}
        </div>
        {complete && <div className={`mt-4 rounded-lg border px-3 py-3 text-sm font-extrabold ${result.eligible ? "border-emerald-200 bg-emerald-50 text-emerald-700" : result.status === "PENDING_VERIFICATION" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-red-700"}`}>{result.status === "ELIGIBLE" ? "RE-LOAN ELIGIBLE" : result.status === "PENDING_VERIFICATION" ? "PENDING VERIFICATION" : "RE-LOAN NOT ELIGIBLE"}</div>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Back to Loan</button>{complete && <button type="button" onClick={handleViewResult} className="rounded-lg bg-[#0B6B43] px-3 py-2 text-xs font-extrabold text-white">View Result</button>}</div>
      </div>
    </div>
  );
};

export default ReLoanEligibilityModal;
