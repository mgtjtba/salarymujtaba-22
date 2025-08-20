import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

// صفحة رئيسية: شبيهة بتطبيق Access لمعالجة Excel وتصدير CSV
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
  // Add BOM for Excel compatibility
  return "\ufeff" + lines.join("\n");
}

const Index = () => {
  const [fileName, setFileName] = useState<string>("");
  const [rawRows, setRawRows] = useState<DataRow[]>([]);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [payerName, setPayerName] = useState<string>("");
  const [qqt, setQqt] = useState<string>("");
  const [monthIndex, setMonthIndex] = useState<string>(String(new Date().getMonth()));
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
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
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<DataRow>(ws, { defval: "" });
      setRawRows(json);
      toast({ title: "تم رفع الملف", description: `عدد الصفوف: ${json.length}` });
    } catch (e) {
      console.error(e);
      toast({ title: "خطأ في قراءة الملف", description: "تأكد من أن الصيغة XLS أو XLSX" });
    }
  }, []);

  const processRows = useCallback(() => {
    if (!rawRows.length) {
      toast({ title: "لا يوجد بيانات", description: "يرجى رفع ملف Excel أولًا" });
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
      const payer = r["Payer Name"]; // آخر قيمة غير فارغة
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
    toast({ title: "تمت المعالجة", description: "تم تحديث الحقول المرجعية والتاريخية" });
  }, [rawRows, remittanceInfo, valueDate]);

  const download = useCallback(() => {
    if (!rows.length) return;
    const csv = toCSV(rows);
    const fnBase = `${payerName || "ملف"}-${remittanceInfo}-${qqt || "QQT"}`.replace(/[\\/:*?"<>|]/g, "-");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fnBase}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "تم تحميل CSV", description: a.download });
  }, [rows, payerName, remittanceInfo, qqt]);

  return (
    <main className="min-h-screen ambient-surface">
      <section className="container py-12">
        <header className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-3">
            <span className="gradient-text">منقّي سجلات إكسل</span>
          </h1>
          <p className="text-muted-foreground text-lg">
            ارفع ملف Excel، حدّد الشهر والسنة، ثم حمّل ملف CSV الناتج — بطريقة أقرب لما لديك في Access.
          </p>
        </header>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>المعالجة والتصدير</CardTitle>
            <CardDescription>يدعم ملفات XLS و XLSX</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6" dir="rtl">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="grid gap-2">
                <Label htmlFor="file">ملف Excel</Label>
                <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
                  <Input
                    id="file"
                    ref={inputRef}
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onPickFile(f);
                    }}
                  />
                  {fileName ? (
                    <Button variant="outline" onClick={() => { setFileName(""); setRawRows([]); setRows([]); inputRef.current && (inputRef.current.value = ""); }}>إزالة</Button>
                  ) : null}
                </div>
                {fileName ? <p className="text-sm text-muted-foreground">الملف: {fileName}</p> : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>الشهر</Label>
                  <Select value={monthIndex} onValueChange={setMonthIndex}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الشهر" />
                    </SelectTrigger>
                    <SelectContent>
                      {arabicMonths.map((m, i) => (
                        <SelectItem key={m} value={String(i)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="year">السنة</Label>
                  <Input
                    id="year"
                    type="number"
                    min={2000}
                    max={2100}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 justify-end">
              <Button variant="hero" onClick={processRows}>معالجة</Button>
              <Button variant="secondary" onClick={download} disabled={!rows.length}>تحميل CSV</Button>
            </div>

            <div className="border rounded-lg overflow-x-auto">
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
                  {rows.slice(0, 8).map((r, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{r["Reference"]}</TableCell>
                      <TableCell>{r["Value Date"]}</TableCell>
                      <TableCell>{r["Remittance Information"]}</TableCell>
                      <TableCell>{r["Beneficiary account"]}</TableCell>
                      <TableCell>{r["Receiver BIC"]}</TableCell>
                      <TableCell>{r["Payer Name"]}</TableCell>
                    </TableRow>
                  ))}
                  {!rows.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        لا توجد بيانات للعرض بعد.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="text-sm text-muted-foreground flex flex-col md:flex-row gap-2 md:justify-between" dir="rtl">
            <span>آخر "Payer Name": {payerName || "—"}</span>
            <span>QQT: {qqt || "—"}</span>
            <span>Value Date: {valueDate}</span>
          </CardFooter>
        </Card>
      </section>
    </main>
  );
};

export default Index;
