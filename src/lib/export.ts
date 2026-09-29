export function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows = [];

  // Add headers
  csvRows.push(headers.join(','));

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

  const csvString = csvRows.join('\n');
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
  }
}
