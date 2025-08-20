import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

// أيقونة الملفات الملونة
const FileIcon = () => (
  <div className="flex gap-1 mb-4">
    <div className="w-8 h-10 bg-blue-300 rounded-sm border border-gray-400 flex items-center justify-center">
      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
    </div>
    <div className="w-8 h-10 bg-red-400 rounded-sm border border-gray-400 flex items-center justify-center">
      <div className="w-2 h-2 bg-red-700 rounded-full"></div>
    </div>
    <div className="w-8 h-10 bg-yellow-400 rounded-sm border border-gray-400 flex items-center justify-center">
      <div className="w-2 h-2 bg-yellow-700 rounded-full"></div>
    </div>
  </div>
);

const arabicMonths = [
  "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول",
] as const;

type DataRow = Record<string, any>;

function yyyymmdd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function toCSV(rows: DataRow[]): string {
  if (!rows.length) return "";
  const headers = Array.from(
    rows.reduce<Set<string>>((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    const line = headers.map((h) => esc(row[h])).join(",");
    lines.push(line);
  }
  return "\ufeff" + lines.join("\n");
}

const Index = () => {
  const [fileName, setFileName] = useState<string>("");
  const [filePath, setFilePath] = useState<string>("");
  const [rawRows, setRawRows] = useState<DataRow[]>([]);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [payerName, setPayerName] = useState<string>("");
  const [qqt, setQqt] = useState<string>("");
  const [monthIndex, setMonthIndex] = useState<string>(String(new Date().getMonth()));
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [showResults, setShowResults] = useState<boolean>(false);
  const valueDate = useMemo(() => yyyymmdd(new Date()), []);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const remittanceInfo = useMemo(() => {
    const idx = Number(monthIndex);
    const y = Number(year) || new Date().getFullYear();
    const name = arabicMonths[idx] ?? arabicMonths[0];
    return `${name} ${y}`;
  }, [monthIndex, year]);

  const onPickFile = useCallback(async (file: File) => {
    try {
      setFileName(file.name);
      setFilePath(file.name);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<DataRow>(ws, { defval: "" });
      setRawRows(json);
      toast({ title: "تم سحب الملف بنجاح", description: `عدد الصفوف: ${json.length}` });
    } catch (e) {
      console.error(e);
      toast({ title: "خطأ في قراءة الملف", description: "تأكد من أن الصيغة XLS أو XLSX" });
    }
  }, []);

  const processRows = useCallback(() => {
    if (!rawRows.length) {
      toast({ title: "لا يوجد ملف", description: "يرجى سحب ملف Excel أولاً" });
      return;
    }
    const ttx = valueDate;
    let lastPayer = "";
    let lastQqt = "";
    const processed = rawRows.map((r) => {
      const benAcc = String(r["Beneficiary account"] ?? "").trim();
      const recBic = String(r["Receiver BIC"] ?? "");
      const first7 = recBic.slice(0, 7);
      lastQqt = first7 || lastQqt;
      const last7 = benAcc.slice(-7);
      const reference = `${first7}${ttx}${last7}`;
      const payer = r["Payer Name"];
      if (payer !== undefined && payer !== null && String(payer).trim() !== "") {
        lastPayer = String(payer).trim();
      }
      return {
        ...r,
        Reference: reference,
        "Value Date": ttx,
        "Remittance Information": remittanceInfo,
      } as DataRow;
    });
    setRows(processed);
    setPayerName(lastPayer);
    setQqt(lastQqt);
    
    // تحميل CSV تلقائياً
    const csv = toCSV(processed);
    const fnBase = `${lastPayer || "ملف"}-${remittanceInfo}-${lastQqt || "QQT"}`.replace(/[\\/:*?"<>|]/g, "-");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fnBase}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    
    toast({ title: "تم تشفير الملف", description: `تم حفظ ${a.download} في مجلد التحميلات` });
  }, [rawRows, remittanceInfo, valueDate]);

  const searchDuplicates = useCallback(() => {
    if (!rows.length) {
      toast({ title: "لا يوجد بيانات", description: "يرجى تشفير الملف أولاً" });
      return;
    }
    setShowResults(true);
    toast({ title: "البحث مكتمل", description: "تم عرض النتائج أدناه" });
  }, [rows]);

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--access-bg))" }}>
      <div className="container max-w-2xl mx-auto py-8">
        {/* الهيدر */}
        <header className="text-center mb-8">
          <FileIcon />
          <h1 className="text-2xl font-bold text-green-700 mb-2">برنامج توطين الرواتب</h1>
          <p className="text-lg font-semibold text-green-600">المبرمج مجتبى فرقد محمد</p>
        </header>

        {/* مسار الملف */}
        <div className="mb-6" dir="rtl">
          <div className="flex items-center gap-3">
            <label className="font-bold text-gray-800 min-w-[100px]">مسار الملف</label>
            <div className="flex-1 relative">
              <Input
                type="file"
                accept=".xls,.xlsx"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickFile(f);
                }}
              />
              <Input
                value={filePath}
                readOnly
                className="bg-white border-2 border-gray-400"
                placeholder="اختر ملف Excel..."
              />
            </div>
          </div>
        </div>

        {/* الأزرار */}
        <div className="flex flex-col gap-4 mb-8">
          <Button
            variant="access-blue"
            onClick={() => inputRef.current?.click()}
            className="mx-auto"
          >
            سحب الملف
          </Button>
          
          <Button
            variant="access-red"
            onClick={processRows}
            className="mx-auto"
            disabled={!rawRows.length}
          >
            تشفير الملف
          </Button>
          
          <Button
            variant="access-green"
            onClick={searchDuplicates}
            className="mx-auto"
            disabled={!rows.length}
          >
            البحث عن التكرار
          </Button>
        </div>

        {/* الملاحظة */}
        <p className="text-center text-red-600 font-semibold mb-8">
          ملاحظة : ملف الـ <span className="font-bold">CSV</span> سيكون في المجلد - رواتب
        </p>

        {/* النتائج */}
        {showResults && rows.length > 0 && (
          <div className="bg-white rounded-lg border-2 border-gray-400 p-4">
            <h3 className="text-lg font-bold mb-4 text-center">نتائج المعالجة</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Value Date</TableHead>
                    <TableHead>Remittance Information</TableHead>
                    <TableHead>Beneficiary account</TableHead>
                    <TableHead>Receiver BIC</TableHead>
                    <TableHead>Payer Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 10).map((r, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm">{r["Reference"]}</TableCell>
                      <TableCell>{r["Value Date"]}</TableCell>
                      <TableCell>{r["Remittance Information"]}</TableCell>
                      <TableCell>{r["Beneficiary account"]}</TableCell>
                      <TableCell>{r["Receiver BIC"]}</TableCell>
                      <TableCell>{r["Payer Name"]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 text-sm text-gray-600 text-center">
              عرض أول 10 صفوف من أصل {rows.length} صف
            </div>
          </div>
        )}

        {/* معلومات إضافية */}
        {rows.length > 0 && (
          <div className="mt-6 bg-white rounded-lg border border-gray-300 p-4" dir="rtl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <strong>آخر دافع:</strong> {payerName || "—"}
              </div>
              <div>
                <strong>QQT:</strong> {qqt || "—"}
              </div>
              <div>
                <strong>تاريخ القيمة:</strong> {valueDate}
              </div>
            </div>
          </div>
        )}
        
        {/* إخفاء حقول الشهر والسنة - أو يمكن إظهارها في حال الحاجة */}
        <div className="hidden">
          <Select value={monthIndex} onValueChange={setMonthIndex}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {arabicMonths.map((m, i) => (
                <SelectItem key={m} value={String(i)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
          }}
        />
      </div>
    </main>
  );
};

export default Index;