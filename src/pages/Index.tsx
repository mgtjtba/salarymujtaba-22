import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

// أيقونة الملفات الملونة
const FileIcon = () => <div className="flex gap-1 mb-4">
    <div className="w-8 h-10 bg-blue-300 rounded-sm border border-gray-400 flex items-center justify-center">
      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
    </div>
    <div className="w-8 h-10 bg-red-400 rounded-sm border border-gray-400 flex items-center justify-center">
      <div className="w-2 h-2 bg-red-700 rounded-full"></div>
    </div>
    <div className="w-8 h-10 bg-yellow-400 rounded-sm border border-gray-400 flex items-center justify-center">
      <div className="w-2 h-2 bg-yellow-700 rounded-full"></div>
    </div>
  </div>;
const arabicMonths = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"] as const;
type DataRow = Record<string, any>;
function yyyymmdd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
function toCSV(rows: DataRow[], delimiter: string = "|"): string {
  if (!rows.length) return "";
  const headers = Array.from(rows.reduce<Set<string>>((set, r) => {
    Object.keys(r).forEach(k => set.add(k));
    return set;
  }, new Set()));
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    const needsQuote = s.includes('"') || s.includes("\n") || s.includes(delimiter);
    if (needsQuote) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(delimiter)];
  for (const row of rows) {
    const line = headers.map(h => esc(row[h])).join(delimiter);
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
  const [duplicateRows, setDuplicateRows] = useState<DataRow[]>([]);
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
      const wb = XLSX.read(buf, {
        type: "array"
      });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<DataRow>(ws, {
        defval: ""
      });
      setRawRows(json);
      toast({
        title: "تم سحب الملف بنجاح",
        description: `عدد الصفوف: ${json.length}`
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "خطأ في قراءة الملف",
        description: "تأكد من أن الصيغة XLS أو XLSX"
      });
    }
  }, []);
  const processRows = useCallback(() => {
    if (!rawRows.length) {
      toast({
        title: "لا يوجد ملف",
        description: "يرجى سحب ملف Excel أولاً"
      });
      return;
    }
    const ttx = valueDate;
    let lastPayer = "";
    let lastQqt = "";
    const processed = rawRows.map(r => {
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
        "Remittance Information": remittanceInfo
      } as DataRow;
    });
    setRows(processed);
    setPayerName(lastPayer);
    setQqt(lastQqt);

    // تحميل CSV تلقائياً
    const csv = toCSV(processed);
    const fnBase = `${lastPayer || "ملف"}-${remittanceInfo}-${lastQqt || "QQT"}`.replace(/[\\/:*?"<>|]/g, "-");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fnBase}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({
      title: "تم تشفير الملف",
      description: `تم حفظ ${a.download} في مجلد التحميلات`
    });
  }, [rawRows, remittanceInfo, valueDate]);
  const searchDuplicates = useCallback(() => {
    if (!rows.length) {
      toast({
        title: "لا يوجد بيانات",
        description: "يرجى تشفير الملف أولاً"
      });
      return;
    }

    // التحقق من وجود IQD و SLEV في جميع الصفوف
    const missingIQD: number[] = [];
    const missingSLEV: number[] = [];
    rows.forEach((row, index) => {
      const rowString = JSON.stringify(row).toLowerCase();
      if (!rowString.includes('iqd')) {
        missingIQD.push(index + 1);
      }
      if (!rowString.includes('slev')) {
        missingSLEV.push(index + 1);
      }
    });

    // إظهار رسائل الخطأ إذا كانت IQD أو SLEV مفقودة
    if (missingIQD.length > 0) {
      toast({
        title: "خطأ: IQD مفقود",
        description: `IQD غير موجود في الصفوف: ${missingIQD.slice(0, 10).join(', ')}${missingIQD.length > 10 ? '...' : ''}`,
        variant: "destructive"
      });
      return;
    }
    if (missingSLEV.length > 0) {
      toast({
        title: "خطأ: SLEV مفقود",
        description: `SLEV غير موجود في الصفوف: ${missingSLEV.slice(0, 10).join(', ')}${missingSLEV.length > 10 ? '...' : ''}`,
        variant: "destructive"
      });
      return;
    }

    // البحث عن التكرارات في حقل Beneficiary Account
    const accountDuplicateMap = new Map<string, DataRow[]>();
    rows.forEach(row => {
      const benAccount = String(row["Beneficiary account"] || row["Beneficiary Account"] || "").trim();
      if (!benAccount) return;
      if (!accountDuplicateMap.has(benAccount)) {
        accountDuplicateMap.set(benAccount, []);
      }
      accountDuplicateMap.get(benAccount)!.push(row);
    });

    // البحث عن التكرارات في حقل Beneficiary Name
    const nameDuplicateMap = new Map<string, DataRow[]>();
    rows.forEach(row => {
      const benName = String(row["Beneficiary Name"] || "").trim();
      if (!benName) return;
      if (!nameDuplicateMap.has(benName)) {
        nameDuplicateMap.set(benName, []);
      }
      nameDuplicateMap.get(benName)!.push(row);
    });

    // جمع جميع الصفوف المكررة من كلا الحقلين
    const duplicates: DataRow[] = [];
    const seenRows = new Set<string>();

    // إضافة التكرارات من Beneficiary Account
    accountDuplicateMap.forEach(rowsGroup => {
      if (rowsGroup.length > 1) {
        rowsGroup.forEach(row => {
          const rowKey = JSON.stringify(row);
          if (!seenRows.has(rowKey)) {
            seenRows.add(rowKey);
            duplicates.push(row);
          }
        });
      }
    });

    // إضافة التكرارات من Beneficiary Name
    nameDuplicateMap.forEach(rowsGroup => {
      if (rowsGroup.length > 1) {
        rowsGroup.forEach(row => {
          const rowKey = JSON.stringify(row);
          if (!seenRows.has(rowKey)) {
            seenRows.add(rowKey);
            duplicates.push(row);
          }
        });
      }
    });
    setDuplicateRows(duplicates);
    setShowResults(true);
    if (duplicates.length > 0) {
      toast({
        title: "تم العثور على تكرارات",
        description: `عدد الصفوف المكررة: ${duplicates.length}`
      });
    } else {
      toast({
        title: "✓ الفحص مكتمل",
        description: "لا توجد تكرارات - IQD و SLEV موجودان في جميع الصفوف"
      });
    }
  }, [rows]);
  return <main style={{
    background: "hsl(var(--access-bg))"
  }} className="min-h-screen bg-emerald-50">
      <div className="container max-w-2xl mx-auto py-8 bg-transparent">
        {/* الهيدر */}
        <header className="text-center mb-8">
          <FileIcon />
          <h1 className="mb-2 text-green-500 font-bold text-4xl">برنامج توطين الرواتب</h1>
          <p className="text-green-600 font-bold text-xl">المبرمج مجتبى فرقد محمد</p>
        </header>

        {/* مسار الملف */}
        <div className="mb-6" dir="rtl">
          <div className="flex items-center gap-3">
            <label className="font-bold text-gray-800 min-w-[100px] rounded bg-transparent">مسار الملف</label>
            <div className="flex-1 relative">
              <Input type="file" accept=".xls,.xlsx" onChange={e => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
            }} className="absolute inset-0 opacity-0 cursor-pointer bg-gray-600" />
              <Input value={filePath} readOnly className="bg-white border-2 border-gray-400" placeholder="اختر ملف Excel..." />
            </div>
          </div>
        </div>

        {/* الأزرار */}
        <div className="flex flex-col gap-4 mb-8">
          <Button variant="access-blue" onClick={() => inputRef.current?.click()} className="mx-auto">
            سحب الملف
          </Button>
          
          <Button variant="access-red" onClick={processRows} className="mx-auto" disabled={!rawRows.length}>تحويل الملف</Button>
          
          <Button variant="access-green" onClick={searchDuplicates} className="mx-auto" disabled={!rows.length}>
            البحث عن التكرار
          </Button>
        </div>


        {/* النتائج */}
        {showResults && <div className="bg-white rounded-lg border-2 border-gray-400 p-4">
            {duplicateRows.length > 0 ? <>
                <h3 className="text-lg font-bold mb-4 text-center text-red-600">الصفوف المكررة</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-center">Beneficiary Account</TableHead>
                        <TableHead className="text-center">Beneficiary Name</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {duplicateRows.map((r, idx) => <TableRow key={idx} className="bg-red-50">
                          <TableCell className="font-mono text-sm text-center">{r["Beneficiary account"] || r["Beneficiary Account"]}</TableCell>
                          <TableCell className="text-center">{r["Beneficiary Name"]}</TableCell>
                        </TableRow>)}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 text-sm text-red-600 text-center font-semibold">
                  عدد الصفوف المكررة: {duplicateRows.length}
                </div>
              </> : <div className="text-center py-8">
                <h3 className="text-lg font-bold mb-2 text-green-600">لا توجد تكرارات</h3>
                <p className="text-gray-600">لم يتم العثور على أي تكرارات في حقلي Beneficiary Account و Beneficiary Name</p>
              </div>}
          </div>}

        {/* معلومات إضافية */}
        {rows.length > 0 && <div className="mt-6 bg-white rounded-lg border border-gray-300 p-4" dir="rtl">
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
          </div>}
        
        {/* إخفاء حقول الشهر والسنة - أو يمكن إظهارها في حال الحاجة */}
        <div className="hidden">
          <Select value={monthIndex} onValueChange={setMonthIndex}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {arabicMonths.map((m, i) => <SelectItem key={m} value={String(i)}>
                  {m}
                </SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" value={year} onChange={e => setYear(e.target.value)} />
        </div>

        <input ref={inputRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={e => {
        const f = e.target.files?.[0];
        if (f) onPickFile(f);
      }} />
      </div>
    </main>;
};
export default Index;