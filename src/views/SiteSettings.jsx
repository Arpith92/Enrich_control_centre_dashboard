import { useState } from 'react'
import readXlsxFile from 'read-excel-file/browser'
import { addThirdPartySites, getConfiguredThirdPartyCustomers, removeThirdPartySite } from '../data/thirdPartySites'

const emptyForm = { customerName: '', siteName: '', ac: '', dc: '', lat: '', lon: '' }
const headers = ['Customer Name', 'Site Name', 'AC Capacity (MW)', 'DC Capacity (MWp)', 'Lat', 'Long']

export default function SiteSettings({ onBack }) {
  const [, setRevision] = useState(0)
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')
  const customers = getConfiguredThirdPartyCustomers()
  const sites = customers.flatMap((customer) => customer.plants.map((plant) => ({ ...plant, customerName: customer.name })))
  const refresh = () => setRevision((value) => value + 1)
  const save = (event) => {
    event.preventDefault()
    addThirdPartySites([{ ...form, ac: Number(form.ac), dc: Number(form.dc), lat: Number(form.lat), lon: Number(form.lon) }])
    setForm(emptyForm); setMessage('Site added successfully.'); refresh()
  }
  const upload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const rows = await readXlsxFile(file)
      const headerMap = Object.fromEntries((rows[0] || []).map((value, index) => [String(value).trim().toLowerCase(), index]))
      const column = (name) => headerMap[name.toLowerCase()]
      if (headers.some((name) => column(name) === undefined)) throw new Error(`Required columns: ${headers.join(', ')}`)
      const imported = rows.slice(1).filter((row) => row[column('Customer Name')] && row[column('Site Name')]).map((row) => ({
        customerName: String(row[column('Customer Name')]).trim(), siteName: String(row[column('Site Name')]).trim(),
        ac: Number(row[column('AC Capacity (MW)')]), dc: Number(row[column('DC Capacity (MWp)')]), lat: Number(row[column('Lat')]), lon: Number(row[column('Long')]),
      }))
      if (!imported.length) throw new Error('No valid site rows found.')
      addThirdPartySites(imported); setMessage(`${imported.length} site(s) imported successfully.`); refresh()
    } catch (error) { setMessage(error.message) }
    event.target.value = ''
  }
  return <div className="site-settings">
    <header><div><span>PORTFOLIO CONFIGURATION</span><h1>Third-Party Site Management</h1><p>Add, remove, or import commissioned plant records.</p></div><button onClick={onBack}>← Dashboard</button></header>
    <section className="settings-add-card"><h2>Add a site</h2><form onSubmit={save}>
      {Object.entries({ customerName: 'Customer Name', siteName: 'Site Name', ac: 'AC Capacity (MW)', dc: 'DC Capacity (MWp)', lat: 'Latitude', lon: 'Longitude' }).map(([key, label]) => <label key={key}><span>{label}</span><input required type={['ac','dc','lat','lon'].includes(key) ? 'number' : 'text'} step="any" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })}/></label>)}
      <button type="submit">Add site</button><label className="excel-upload"><span>Import Excel</span><input type="file" accept=".xlsx" onChange={upload}/></label>
    </form>{message && <p className="settings-message">{message}</p>}</section>
    <section className="settings-sites-card"><div><h2>Existing third-party plants</h2><span>{sites.length} plants</span></div><div className="settings-table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}<th>Action</th></tr></thead><tbody>
      {sites.map((site) => <tr key={site.id}><td>{site.customerName}</td><td>{site.site}</td><td>{site.ac}</td><td>{site.dc}</td><td>{site.lat}</td><td>{site.lon}</td><td><button onClick={() => { removeThirdPartySite(site.id); setMessage(`${site.site} removed.`); refresh() }}>Remove</button></td></tr>)}
    </tbody></table></div></section>
  </div>
}
