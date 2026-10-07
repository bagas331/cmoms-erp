export function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data || data.length === 0) {
    if (typeof window !== 'undefined') {
      alert('Tidak ada data untuk diekspor.');
    }
    return;
  }

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];

  // Add escaped headers
  csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

  // Add rows with CSV Injection (Formula Injection) mitigation
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      let strVal = '' + (val ?? '');
      
      // Neutralize formula injection triggers: =, +, -, @, tab, carriage return
      if (/^[=+\-@\t\r%]/.test(strVal)) {
        strVal = `'${strVal}`;
      }
      
      const escaped = strVal.replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  // Use \r\n for universal spreadsheet compatibility and \uFEFF BOM for UTF-8 Excel support
  const csvString = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

