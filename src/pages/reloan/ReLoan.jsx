import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CarFront,
  CheckCircle2,
  LoaderCircle,
  Phone,
  Search,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  checkReLoanEligibility,
  calculateReLoanFinancialSummary,
  findCustomerAndLoan,
  getCustomerLoans,
  getReLoanRules,
  saveReLoanEligibility,
} from "../../services/reloanStorage";
import { can } from "../../config/permissions";
import { getCustomers } from "../../services/customerStorage";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const ReLoan = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const loanId = new URLSearchParams(location.search).get("loanId") || "";
  const [customerRecords, setCustomerRecords] = useState([]);

  useEffect(() => {
    let cancelled = false;

    getCustomers().then((records) => {
      if (!cancelled) {
        setCustomerRecords(records);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);
  const [search, setSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [checking, setChecking] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [scanIndex, setScanIndex] = useState(0);
  const [scanResult, setScanResult] = useState(null);
  const [result, setResult] = useState(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const customerRows = useMemo(() => {
    return customerRecords
      .map((customer) => {
        const loans = getCustomerLoans(customer);
        const loan = loans[0] || customer?.loan || null;

        if (!loan) {
          return null;
        }

        return {
          customer,
          loan,
          vehicle: loan?.vehicle || customer?.vehicle || {},
        };
      })
      .filter(Boolean);
  }, [customerRecords]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return customerRows;
    }

    return customerRows.filter(({ customer, loan, vehicle }) => {
      const haystack = [
        customer?.customer?.id,
        customer?.customer?.customerNumber,
        customer?.customer?.personal?.name,
        customer?.customer?.personal?.mobileNumber,
        customer?.customer?.personal?.alternateMobileNumber,
        loan?.loanNumber,
        loan?.id,
        vehicle?.registrationNumber,
        vehicle?.vehicleId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [customerRows, search]);

  useEffect(() => {
    if (!loanId) {
      return;
    }

    let cancelled = false;

    findCustomerAndLoan(loanId).then((match) => {
      if (!cancelled && match) {
        setSelectedRecord(match);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loanId]);

  useEffect(() => {
    if (!checking || !scanResult) {
      return undefined;
    }

    if (scanIndex >= scanResult.checks.length) {
      let cancelled = false;

      saveReLoanEligibility(scanResult).then((saved) => {
        if (cancelled) {
          return;
        }

        setResult(saved);
        setChecking(false);
        setScanComplete(true);
        setShowResultModal(false);
      });

      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => {
      setScanIndex((index) => index + 1);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [checking, scanIndex, scanResult]);

  const beginEligibilityCheck = async () => {
    if (!selectedRecord) {
      return;
    }

const calculated = await checkReLoanEligibility({
  customer: selectedRecord.customer,
  loan: selectedRecord.loan,
  vehicle: selectedRecord.vehicle,
  rules: await getReLoanRules(),
});

    setScanResult(calculated);
    setScanIndex(0);
    setScanComplete(false);
    setResult(null);
    setChecking(true);
  };

  const handleSelectCustomer = (record) => {
    setSelectedRecord(record);
    setScanResult(null);
    setResult(null);
    setChecking(false);
    setScanComplete(false);
    setScanIndex(0);
    setShowResultModal(false);
  };

  const startReLoan = () => {
    if (!selectedRecord) {
      return;
    }

    navigate(
      `/customers/onboarding?type=reloan&customerId=${encodeURIComponent(
        selectedRecord.customer?.customer?.id || ""
      )}&previousLoanId=${encodeURIComponent(
        selectedRecord.loan?.id || selectedRecord.loan?.loanNumber || ""
      )}`
    );
  };

  const selectedSummary = selectedRecord
    ? calculateReLoanFinancialSummary(selectedRecord.loan)
    : null;

  return (
    <div className="min-h-full bg-[#F6F8F7] p-4 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <button
          type="button"
          onClick={() => navigate("/loan")}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-[#0B5D3B]"
        >
          <ArrowLeft size={14} />
          Back to Loans
        </button>

        <header className="space-y-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#0B6B43]">
            Auto Finance
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#17221D]">
            Re-loan
          </h1>
          <p className="text-xs text-slate-500">
            Review customer repayment history and previous loan details before creating a new loan.
          </p>
        </header>

        {!selectedRecord ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-extrabold text-[#17221D]">Find Customer</h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  Search by customer ID, customer name, mobile number, registration number or loan number.
                </p>
              </div>
            </div>

            <div className="relative mt-3">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer, mobile, vehicle number or loan number..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-[#FBFCFB] pl-9 pr-3 text-[12px] font-medium text-[#17221D] outline-none transition focus:border-[#9CCEB1] focus:ring-2 focus:ring-[#EAF5EF]"
              />
            </div>

            <style>{`
              .reloan-customer-list::-webkit-scrollbar {
                width: 8px;
              }

              .reloan-customer-list::-webkit-scrollbar-track {
                background: transparent;
              }

              .reloan-customer-list::-webkit-scrollbar-thumb {
                background: #d8e0dc;
                border-radius: 9999px;
              }

              .reloan-customer-list::-webkit-scrollbar-thumb:hover {
                background: #c2cdc7;
              }
            `}</style>

            {filteredCustomers.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-[12px] font-medium text-slate-500">
                No matching customer or loan found.
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 sm:grid sm:grid-cols-[minmax(260px,1fr)_140px_160px_110px]">
                  <span className="px-1">Customer</span>
                  <span className="px-1">Loan Amount</span>
                  <span className="px-1">Outstanding</span>
                  <span className="px-1 text-right sm:text-left">Action</span>
                </div>

                <div
                  className="reloan-customer-list max-h-[430px] overflow-y-auto bg-white sm:max-h-[430px]"
                  style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5D1 transparent" }}
                >
                  {filteredCustomers.map(({ customer, loan, vehicle }) => (
                    <CustomerCard
                      key={loan?.id || loan?.loanNumber || customer?.customer?.id || "customer-card"}
                      customer={customer}
                      loan={loan}
                      vehicle={vehicle}
                      onSelect={() => handleSelectCustomer({ customer, loan, vehicle })}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <SelectedCustomerSummary
              customer={selectedRecord.customer}
              loan={selectedRecord.loan}
              vehicle={selectedRecord.vehicle}
              onChangeCustomer={() => {
                setSelectedRecord(null);
                setResult(null);
                setChecking(false);
                setScanResult(null);
                setScanIndex(0);
                setScanComplete(false);
              }}
            />

            <PreviousLoanSummary
              customer={selectedRecord.customer}
              loan={selectedRecord.loan}
              vehicle={selectedRecord.vehicle}
              summary={selectedSummary}
            />

            {!result && !checking && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Eligibility
                    </p>
                    <h3 className="mt-1 text-[18px] font-extrabold text-[#17221D]">
                      Check Re-loan Eligibility
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={beginEligibilityCheck}
                    className="rounded-xl bg-[#0B6B43] px-4 py-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#095B3B]"
                  >
                    Check Re-loan Eligibility
                  </button>
                </div>
              </div>
            )}

            {checking && scanResult && (
              <EligibilityScanner
                result={scanResult}
                scanIndex={scanIndex}
                checking={checking}
              />
            )}

            {!checking && scanComplete && result && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0B6B43] shadow-sm">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                        Eligibility
                      </p>
                      <p className="mt-1 text-[14px] font-extrabold text-[#17221D]">
                        Eligibility check completed
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowResultModal(true)}
                    className="rounded-xl bg-[#0B6B43] px-4 py-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#095B3B]"
                  >
                    View Eligibility Result
                  </button>
                </div>
              </div>
            )}

            {showResultModal && result && (
              <EligibilityResultModal
                result={result}
                customerName={selectedRecord?.customer?.customer?.personal?.name || "Customer"}
                customerId={selectedRecord?.customer?.customer?.customerNumber || selectedRecord?.customer?.customer?.id || "—"}
                loanNumber={selectedRecord?.loan?.loanNumber || "—"}
                onStart={startReLoan}
                onClose={() => setShowResultModal(false)}
                onCheckAgain={() => {
                  setShowResultModal(false);
                  setResult(null);
                  setScanResult(null);
                  setScanComplete(false);
                  setChecking(false);
                  setScanIndex(0);
                }}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
};

const CustomerCard = ({ customer, loan, vehicle, onSelect }) => {
  const summary = calculateReLoanFinancialSummary(loan);

  const customerName = customer?.customer?.personal?.name || "Customer";
  const customerId = customer?.customer?.customerNumber || customer?.customer?.id || "—";

  return (
    <div className="border-b border-[#EEF2EF] bg-white transition hover:bg-[#F7FBF8]">
      <div
        className="grid min-h-[72px] items-center gap-2 px-3 py-2.5 sm:grid-cols-[minmax(260px,1fr)_140px_160px_110px] sm:px-3.5"
        style={{ gridTemplateColumns: "minmax(260px, 1fr) 140px 160px 110px" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF5EF] text-[#0B6B43]">
            <UserRound size={16} />
          </div>

          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-[#17221D]">{customerName}</p>
            <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">{customerId}</p>
          </div>
        </div>

        <div className="text-[11px] font-bold text-[#17221D] sm:text-left">
          {money(loan?.loanAmount)}
        </div>

        <div className="text-[11px] font-bold text-[#17221D] sm:text-left">
          {money(summary.totalOutstanding)}
        </div>

        <div className="flex justify-end sm:justify-start">
          <button
            type="button"
            onClick={onSelect}
            className="inline-flex h-8 w-[92px] items-center justify-center rounded-lg bg-[#0B6B43] px-2.5 text-[10px] font-extrabold text-white transition hover:bg-[#095B3B]"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
};

const SelectedCustomerSummary = ({ customer, loan, vehicle, onChangeCustomer }) => {
  const customerName = customer?.customer?.personal?.name || "Customer";
  const customerId = customer?.customer?.customerNumber || customer?.customer?.id || "—";
  const mobile = customer?.customer?.personal?.mobileNumber || "—";
  const loanNumber = loan?.loanNumber || "—";
  const loanStatus = loan?.status || "—";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EAF5EF] text-[#0B6B43]">
            <UserRound size={18} />
          </div>

          <div>
            <p className="text-[12px] font-medium text-slate-500">Selected customer</p>
            <h2 className="text-[18px] font-extrabold text-[#17221D]">{customerName}</h2>
          </div>
        </div>

        <button
          type="button"
          onClick={onChangeCustomer}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-extrabold text-slate-600 transition hover:border-[#B9DCC6] hover:bg-[#F6FBF8] hover:text-[#0B5D3B]"
        >
          Change Customer
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoBlock label="Customer ID" value={customerId} />
        <InfoBlock label="Mobile" value={mobile} />
        <InfoBlock label="Previous Loan" value={loanNumber} />
        <InfoBlock label="Loan Status" value={loanStatus} />
      </div>
    </section>
  );
};

const PreviousLoanSummary = ({ customer, loan, vehicle, summary }) => {
  const fields = [
    { label: "Previous Loan Number", value: loan?.loanNumber || "—" },
    { label: "Loan Amount", value: money(loan?.loanAmount) },
    { label: "Outstanding Amount", value: money(summary?.totalOutstanding) },
    { label: "Loan Status", value: loan?.status || "—" },
    { label: "Interest Type", value: loan?.interestType || "—" },
    { label: "Interest Rate", value: loan?.interestRate ? `${loan.interestRate}%` : "—" },
    { label: "Repayment Method", value: loan?.repaymentMethod || "—" },
    { label: "Frequency", value: loan?.frequency || "—" },
    { label: "Tenure", value: loan?.tenure ? `${loan.tenure} Months` : "—" },
    { label: "Vehicle", value: vehicle?.vehicleName || vehicle?.model || "—" },
    { label: "Registration Number", value: vehicle?.registrationNumber || vehicle?.vehicleId || "—" },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-extrabold text-[#17221D]">Previous Loan Summary</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <InfoBlock key={field.label} label={field.label} value={field.value} />
        ))}
      </div>
    </section>
  );
};

const EligibilityResultModal = ({
  result,
  customerName,
  customerId,
  loanNumber,
  onStart,
  onClose,
  onCheckAgain,
}) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px]">
    <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Eligibility Result
          </p>
          <h3 className="mt-1 text-[16px] font-extrabold text-[#17221D]">{customerName}</h3>
          <p className="text-[10px] text-slate-500">{customerId} • {loanNumber}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          aria-label="Close eligibility result"
        >
          <XCircle size={16} />
        </button>
      </div>

      <div className="p-4 sm:p-5">
        <div
          className={`rounded-2xl border p-4 ${
            result.eligible
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : result.status === "PENDING_VERIFICATION"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <div className="flex items-center gap-3">
            {result.eligible ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
            <div>
              <h4 className="text-lg font-extrabold">
                {result.eligible ? "RE-LOAN ELIGIBLE" : result.status === "PENDING_VERIFICATION" ? "PENDING VERIFICATION" : "RE-LOAN NOT ELIGIBLE"}
              </h4>
              <p className="mt-1 text-xs">
                {result.eligible
                  ? "Customer meets the current re-loan eligibility requirements."
                  : result.status === "PENDING_VERIFICATION"
                    ? "Some checks still require verification before the customer can proceed."
                    : "Customer does not currently meet all re-loan eligibility requirements."}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {result.checks.map((check) => (
            <div key={check.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${
                    check.status === "pass"
                      ? "bg-emerald-100 text-emerald-700"
                      : check.status === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {check.status === "pass" ? <CheckCircle2 size={12} /> : check.status === "pending" ? "!" : <XCircle size={12} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-[#17221D]">{check.label}</p>
                  <p className="text-[10px] text-slate-500">{check.message}</p>
                </div>
              </div>

              <span
                className={`rounded-full px-2 py-1 text-[8px] font-extrabold ${
                  check.status === "pass"
                    ? "bg-emerald-50 text-emerald-700"
                    : check.status === "pending"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-red-50 text-red-700"
                }`}
              >
                {check.status === "pass" ? "PASS" : check.status === "pending" ? "PENDING VERIFICATION" : "FAIL"}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={onCheckAgain} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            Check Again
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            Close
          </button>
          {result.eligible && can("reloan", "add") && (
            <button type="button" onClick={onStart} className="rounded-lg bg-[#0B6B43] px-4 py-2 text-xs font-extrabold text-white">
              Start New Loan
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
);

const EligibilityScanner = ({ result, scanIndex, checking }) => (
  <section className="rounded-2xl border border-[#CFE8D9] bg-white p-5 shadow-sm">
    <div className="flex flex-col items-center border-b border-slate-100 pb-5 text-center">
      <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-4 border-[#D8E9DF]">
        <div className="absolute inset-1 animate-spin rounded-full border-2 border-transparent border-t-[#0B6B43]" />
        <div className="absolute h-12 w-12 animate-pulse rounded-full bg-[#EAF5EF]" />
        {checking ? (
          <LoaderCircle size={22} className="relative animate-spin text-[#0B6B43]" />
        ) : (
          <CheckCircle2 size={25} className="relative text-[#0B6B43]" />
        )}
      </div>

      <h2 className="mt-4 text-lg font-extrabold text-[#17221D]">
        {checking ? "Checking Re-loan Eligibility" : "Eligibility checks complete"}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {checking
          ? "Verifying repayment history, overdue status, vehicle condition and verification requirements..."
          : "The result below uses the checks saved in the current application state."}
      </p>

      <div className="mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#0B6B43] transition-all duration-500"
          style={{ width: `${Math.min((scanIndex / result.checks.length) * 100, 100)}%` }}
        />
      </div>
    </div>

    <div className="mt-4 space-y-2">
      {result.checks.map((check, index) => {
        const passed = index < scanIndex;
        const active = checking && index === scanIndex;

        return (
          <div key={check.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                active
                  ? "bg-[#EAF5EF] text-[#0B6B43]"
                  : passed
                    ? check.status === "pass"
                      ? "bg-emerald-50 text-emerald-700"
                      : check.status === "pending"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {active ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : passed ? (
                check.status === "pass" ? (
                  <CheckCircle2 size={14} />
                ) : check.status === "pending" ? (
                  "!"
                ) : (
                  <XCircle size={14} />
                )
              ) : (
                "•"
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[#17221D]">{check.label}</p>
              <p className="text-[10px] text-slate-500">
                {active ? "Checking..." : passed ? check.message : "Pending"}
              </p>
            </div>
            <span className="text-[9px] font-extrabold text-slate-400">
              {active ? "CHECKING" : passed ? check.status.toUpperCase() : "PENDING"}
            </span>
          </div>
        );
      })}
    </div>
  </section>
);

const InfoBlock = ({ label, value }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
    <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
    <p className="mt-1 text-[12px] font-extrabold text-[#17221D]">{value}</p>
  </div>
);

export default ReLoan;
