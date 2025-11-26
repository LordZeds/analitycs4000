'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { Users, ShoppingCart, CreditCard, DollarSign, TrendingUp, LogOut, Loader2 } from 'lucide-react'

// Tipagem simplificada do que vem do banco
type DashboardData = {
    kpis: { uniqueVisitors: number; uniqueCheckouts: number; totalSales: number; revenue: number }
    funnel: any[]
    evolution: any[]
    sources: any[]
    recent_sales: any[]
    top_pages: any[]
}

const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export default function DashboardClient() {
    const router = useRouter()
    const supabase = createClient()
    const [sites, setSites] = useState<any[]>([])
    const [selectedSiteId, setSelectedSiteId] = useState<string>('')
    const [period, setPeriod] = useState<string>('7d')
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<DashboardData | null>(null)

    const handleSignOut = async () => { await supabase.auth.signOut(); router.push('/login') }

    // Busca lista de sites
    useEffect(() => {
        const fetchSites = async () => {
            const { data } = await supabase.from('sites').select('id, name')
            if (data && data.length > 0) {
                setSites(data)
                setSelectedSiteId(data[0].id)
            }
        }
        fetchSites()
    }, [])

    // Busca Dados via RPC (Processamento no Banco)
    useEffect(() => {
        if (!selectedSiteId) return
        const fetchData = async () => {
            setLoading(true)
            const { data, error } = await supabase.rpc('get_dashboard_data', {
                p_site_id: selectedSiteId,
                p_period: period
            })
            if (!error) setData(data as DashboardData)
            setLoading(false)
        }
        fetchData()
    }, [selectedSiteId, period])

    if (!data && loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
    if (!data) return <div className="p-8 text-center">Selecione um site para ver os dados.</div>

    const conversion = data.kpis.uniqueVisitors > 0 ? (data.kpis.totalSales / data.kpis.uniqueVisitors) * 100 : 0

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Analytics</h1>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={handleSignOut}><LogOut className="h-4" /></Button>
                    <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                        <SelectTrigger className="w-[200px]"><SelectValue placeholder="Site" /></SelectTrigger>
                        <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={period} onValueChange={setPeriod}>
                        <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Hoje</SelectItem>
                            <SelectItem value="7d">7 Dias</SelectItem>
                            <SelectItem value="30d">30 Dias</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-5">
                <KpiCard title="Visitantes" value={data.kpis.uniqueVisitors} icon={Users} />
                <KpiCard title="Checkouts" value={data.kpis.uniqueCheckouts} icon={ShoppingCart} />
                <KpiCard title="Vendas" value={data.kpis.totalSales} icon={CreditCard} />
                <KpiCard title="Receita" value={formatCurrency(data.kpis.revenue)} icon={DollarSign} />
                <KpiCard title="Conv." value={`${conversion.toFixed(1)}%`} icon={TrendingUp} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader><CardTitle>Funil</CardTitle></CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.funnel} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} /><Tooltip /><Bar dataKey="value" barSize={30} /></BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Evolução</CardTitle></CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.evolution}><XAxis dataKey="date" /><YAxis /><Tooltip /><Line type="monotone" dataKey="visitors" stroke="#3b82f6" /><Line type="monotone" dataKey="sales" stroke="#10b981" /></LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader><CardTitle>Top Páginas</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Página</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Visitas</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {data.top_pages.map((p: any, i: number) => (
                                    <TableRow key={i}>
                                        <TableCell className="font-mono text-xs">{p.path}</TableCell>
                                        <TableCell><Badge variant="outline">{p.content_type}</Badge></TableCell>
                                        <TableCell className="text-right">{p.visitors}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Últimas Vendas</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {data.recent_sales.map((s: any, i: number) => (
                                    <TableRow key={i}>
                                        <TableCell>
                                            <div className="font-medium">{s.buyer_name}</div>
                                            <div className="text-xs text-muted-foreground">{s.product_name}</div>
                                        </TableCell>
                                        <TableCell className="text-right">{formatCurrency(s.price_value)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

function KpiCard({ title, value, icon: Icon }: any) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
        </Card>
    )
}
