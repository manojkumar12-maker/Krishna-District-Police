const xlsx = require('xlsx');

const records = [
  { Name: 'K. Srinivasa Rao', Rank: 'PC', 'Genl.No': 'PC-1001', 'Personnel Type': 'CIVIL', District: 'ERSTWHILE', Gender: 'Male', Status: 'Present', 'Present Working': 'Bandar Taluk PS', 'Date of Birth': '1985-03-15', Caste: 'OC', Education: 'Intermediate', 'Phone Number': '9876543210' },
  { Name: 'G. Lakshmi', Rank: 'WPC', 'Genl.No': 'WPC-2001', 'Personnel Type': 'CIVIL', District: 'ERSTWHILE', Gender: 'Female', Status: 'Present', 'Present Working': 'Machilipatnam PS', 'Date of Birth': '1990-07-22', Caste: 'BC', Education: 'SSC', 'Phone Number': '9876543211' },
  { Name: 'P. Ravi Kumar', Rank: 'HC', 'Genl.No': 'HC-3001', 'Personnel Type': 'CIVIL', District: 'NEW', Gender: 'Male', Status: 'Present', 'Present Working': 'Gudivada I Town PS', 'Date of Birth': '1982-11-08', Caste: 'SC', Education: 'Degree', 'Phone Number': '9876543212' },
  { Name: 'T. Anjali', Rank: 'WHC', 'Genl.No': 'WHC-4001', 'Personnel Type': 'CIVIL', District: 'NEW', Gender: 'Female', Status: 'Present', 'Present Working': 'Gannavaram UPS', 'Date of Birth': '1992-01-30', Caste: 'ST', Education: 'Intermediate', 'Phone Number': '9876543213' },
  { Name: 'M. Venkatesh', Rank: 'ASI', 'Genl.No': 'ASI-5001', 'Personnel Type': 'CIVIL', District: 'ERSTWHILE', Gender: 'Male', Status: 'Present', 'Present Working': 'Avanigadda PS', 'Date of Birth': '1978-06-14', Caste: 'OC', Education: 'Degree', 'Phone Number': '9876543214' },
  { Name: 'S. Padmavathi', Rank: 'WASI', 'Genl.No': 'WASI-6001', 'Personnel Type': 'CIVIL', District: 'NEW', Gender: 'Female', Status: 'Present', 'Present Working': 'Penamaluru UPS', 'Date of Birth': '1988-09-05', Caste: 'BC', Education: 'Degree', 'Phone Number': '9876543215' },
  { Name: 'D. Rama Rao', Rank: 'SI', 'Genl.No': 'SI-7001', 'Personnel Type': 'CIVIL', District: 'ERSTWHILE', Gender: 'Male', Status: 'Present', 'Present Working': 'Pedana PS', 'Date of Birth': '1975-02-18', Caste: 'OC', Education: 'PG', 'Phone Number': '9876543216' },
  { Name: 'V. Suneetha', Rank: 'WSI', 'Genl.No': 'WSI-8001', 'Personnel Type': 'CIVIL', District: 'NEW', Gender: 'Female', Status: 'Present', 'Present Working': 'Vuyyuru Town UPS', 'Date of Birth': '1986-12-25', Caste: 'SC', Education: 'PG', 'Phone Number': '9876543217' },
  { Name: 'B. Suresh', Rank: 'CI', 'Genl.No': 'CI-9001', 'Personnel Type': 'CIVIL', District: 'ERSTWHILE', Gender: 'Male', Status: 'Present', 'Present Working': 'Bandar Rural Circle', 'Date of Birth': '1972-08-10', Caste: 'BC', Education: 'Degree', 'Phone Number': '9876543218' },
  { Name: 'K. Varalakshmi', Rank: 'WCI', 'Genl.No': 'WCI-1001', 'Personnel Type': 'CIVIL', District: 'NEW', Gender: 'Female', Status: 'Present', 'Present Working': 'Kankipadu PS', 'Date of Birth': '1980-04-03', Caste: 'OC', Education: 'Degree', 'Phone Number': '9876543219' },
  { Name: 'N. Prasad', Rank: 'DSP', 'Genl.No': 'DSP-1101', 'Personnel Type': 'CIVIL', District: 'ERSTWHILE', Gender: 'Male', Status: 'Present', 'Present Working': 'Bandar Sub-Division', 'Date of Birth': '1970-05-20', Caste: 'OC', Education: 'PG', 'Phone Number': '9876543220' },
  { Name: 'R. Charan', Rank: 'ADDL.SP', 'Genl.No': 'ADSP-1201', 'Personnel Type': 'CIVIL', District: 'NEW', Gender: 'Male', Status: 'Present', 'Present Working': 'Gudivada Sub-Division', 'Date of Birth': '1968-11-12', Caste: 'OC', Education: 'PG', 'Phone Number': '9876543221' },
  { Name: 'M. Rajesh', Rank: 'ARPC', 'Genl.No': 'ARPC-1301', 'Personnel Type': 'AR', District: 'ERSTWHILE', Gender: 'Male', Status: 'Present', 'Present Working': 'DSB, Krishna', 'Date of Birth': '1989-07-15', Caste: 'BC', Education: 'SSC', 'Phone Number': '9876543222' },
  { Name: 'L. Kalyani', Rank: 'ARWPC', 'Genl.No': 'ARWPC-1401', 'Personnel Type': 'AR', District: 'NEW', Gender: 'Female', Status: 'Present', 'Present Working': 'DCRB, Krishna', 'Date of Birth': '1991-02-28', Caste: 'SC', Education: 'Intermediate', 'Phone Number': '9876543223' },
  { Name: 'P. Nageswara Rao', Rank: 'ARHC', 'Genl.No': 'ARHC-1501', 'Personnel Type': 'AR', District: 'ERSTWHILE', Gender: 'Male', Status: 'Present', 'Present Working': 'PCR, Krishna', 'Date of Birth': '1983-09-10', Caste: 'OC', Education: 'SSC', 'Phone Number': '9876543224' },
  { Name: 'S. Bharathi', Rank: 'ARWHC', 'Genl.No': 'ARWHC-1601', 'Personnel Type': 'AR', District: 'NEW', Gender: 'Female', Status: 'Present', 'Present Working': 'Women PS', 'Date of Birth': '1993-06-05', Caste: 'ST', Education: 'Degree', 'Phone Number': '9876543225' },
  { Name: 'G. Simhadri', Rank: 'ARSI', 'Genl.No': 'ARSI-1701', 'Personnel Type': 'AR', District: 'ERSTWHILE', Gender: 'Male', Status: 'Present', 'Present Working': 'CCS, Machilipatnam', 'Date of Birth': '1977-01-19', Caste: 'BC', Education: 'Degree', 'Phone Number': '9876543226' },
  { Name: 'D. Nagamani', Rank: 'WARSI', 'Genl.No': 'WARSI-1801', 'Personnel Type': 'AR', District: 'NEW', Gender: 'Female', Status: 'Present', 'Present Working': 'CCS, Gudivada', 'Date of Birth': '1985-10-22', Caste: 'OC', Education: 'Degree', 'Phone Number': '9876543227' },
  { Name: 'V. Subba Rao', Rank: 'RSI', 'Genl.No': 'RSI-1901', 'Personnel Type': 'AR', District: 'ERSTWHILE', Gender: 'Male', Status: 'Present', 'Present Working': 'D.T.C., MTM', 'Date of Birth': '1974-12-03', Caste: 'SC', Education: 'PG', 'Phone Number': '9876543228' },
  { Name: 'P. Anitha', Rank: 'WRSI', 'Genl.No': 'WRSI-2001', 'Personnel Type': 'AR', District: 'NEW', Gender: 'Female', Status: 'Present', 'Present Working': 'Cyber Crime', 'Date of Birth': '1987-08-14', Caste: 'BC', Education: 'PG', 'Phone Number': '9876543229' },
  { Name: 'K. Appa Rao', Rank: 'RI', 'Genl.No': 'RI-2101', 'Personnel Type': 'AR', District: 'ERSTWHILE', Gender: 'Male', Status: 'Present', 'Present Working': 'AIRPORT', 'Date of Birth': '1971-03-27', Caste: 'OC', Education: 'Degree', 'Phone Number': '9876543230' },
  { Name: 'Y. Nirmala', Rank: 'WRI', 'Genl.No': 'WRI-2201', 'Personnel Type': 'AR', District: 'NEW', Gender: 'Female', Status: 'Present', 'Present Working': 'SC/ST Cell', 'Date of Birth': '1984-05-18', Caste: 'SC', Education: 'Degree', 'Phone Number': '9876543231' },
  { Name: 'A. Mohan', Rank: 'ARDSP', 'Genl.No': 'ARDSP-2301', 'Personnel Type': 'AR', District: 'ERSTWHILE', Gender: 'Male', Status: 'Present', 'Present Working': 'VR., KRISHNA', 'Date of Birth': '1969-09-09', Caste: 'OC', Education: 'PG', 'Phone Number': '9876543232' },
  { Name: 'R. Krishna Reddy', Rank: 'ADDL.SP.AR', 'Genl.No': 'ADSPAR-2401', 'Personnel Type': 'AR', District: 'NEW', Gender: 'Male', Status: 'Deserter', 'Present Working': '-', 'Date of Birth': '1967-04-02', Caste: 'OC', Education: 'PG', 'Phone Number': '9876543233', 'Previous Station': 'Gudivada II Town PS' },
  { Name: 'U. Mahesh', Rank: 'PC', 'Genl.No': 'PC-1002', 'Personnel Type': 'CIVIL', District: 'NEW', Gender: 'Male', Status: 'Present', 'Present Working': 'Pamarru PS', 'Date of Birth': '1994-11-15', Caste: 'BC', Education: 'Intermediate', 'Phone Number': '9876543234', 'On Deputation': 'YES', 'Deployment Unit': 'GRP., Vijayawada', 'Deployment Date': '2024-06-01' },
];

const ws = xlsx.utils.json_to_sheet(records);

ws['!cols'] = [
  { wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 8 },
  { wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 16 }
];

const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, 'Personnel');

const path = process.argv[2] || '../personnel.xlsx';
xlsx.writeFile(wb, path);
console.log(`Sample file created: ${path} (${records.length} records)`);
