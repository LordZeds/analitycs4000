'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Site, Pageview, InitiateCheckout, Purchase } from '@/types/supabase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { Users, ShoppingCart, CreditCard, DollarSign, TrendingUp, ArrowDown } from 'lucide-react'

// Helper to format currency
const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

// Helper to format percentage
const formatPercent = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1 }).format(value / 100)

export default function DashboardClient() {
    const [sites, setSites] = useState<Site[]>([])
    const [selectedSiteId, setSelectedSiteId] = useState<string>('')
    const [period, setPeriod] = useState<string>('7d')
    const [loading, setLoading] = useState(false)

    // Raw Data
    const [pageviews, setPageviews] = useState<Pageview[]>([])
    const [checkouts, setCheckouts] = useState<InitiateCheckout[]>([])
    const [purchases, setPurchases] = useState<Purchase[]>([])

    // Fetch Sites
    useEffect(() => {
        const fetchSites = async () => {
            const { data } = await supabase.from('sites').select('*')
            if (data && data.length > 0) {
                const sitesData = data as Site[]
                setSites(sitesData)
                setSelectedSiteId(sitesData[0].id)
            }
        }
        fetchSites()
    }, [])

    // Fetch Data based on filters
    useEffect(() => {
        if (!selectedSiteId) return

        const fetchData = async () => {
            setLoading(true)

            // Calculate start date
            const now = new Date()
            let startDate = new Date()
            if (period === 'today') {
                startDate.setHours(0, 0, 0, 0)
            } else if (period === '7d') {
                startDate.setDate(now.getDate() - 7)
            } else if (period === '30d') {
                startDate.setDate(now.getDate() - 30)
            }

            const isoDate = startDate.toISOString()

            // Parallel Fetching
            const [pvRes, icRes, purRes] = await Promise.all([
                supabase.from('pageviews')
                    .select('*')
                    .eq('site_id', selectedSiteId)
                    .gte('timestamp', isoDate),
                supabase.from('initiate_checkouts')
                    .select('*')
                    .eq('site_id', selectedSiteId)
                    .gte('timestamp', isoDate),
                supabase.from('purchases')
                    .select('*')
                    .eq('site_id', selectedSiteId)
                    .gte('timestamp', isoDate)
            ])

            if (pvRes.data) setPageviews(pvRes.data as Pageview[])
            if (icRes.data) setCheckouts(icRes.data as InitiateCheckout[])
            if (purRes.data) setPurchases(purRes.data as Purchase[])

            setLoading(false)
        }

        fetchData()
    }, [selectedSiteId, period])

    // Calculate KPIs
    const kpis = useMemo(() => {
        const uniqueVisitors = new Set(pageviews.map(p => p.visitor_id)).size
        const uniqueCheckouts = new Set(checkouts.map(c => c.visitor_id)).size
        const totalSales = purchases.length
        const revenue = purchases.reduce((acc, p) => acc + p.price_value, 0)
        const conversionRate = uniqueVisitors > 0 ? (totalSales / uniqueVisitors) * 100 : 0

        return { uniqueVisitors, uniqueCheckouts, totalSales, revenue, conversionRate }
    }, [pageviews, checkouts, purchases])

    // Chart Data: Funnel
    const funnelData = useMemo(() => {
        const v = kpis.uniqueVisitors
        const c = kpis.uniqueCheckouts
        const s = kpis.totalSales

        const dropToCheckout = v > 0 ? ((v - c) / v) * 100 : 0
        const dropToSale = c > 0 ? ((c - s) / c) * 100 : 0

        return [
            { name: 'Visitantes', value: v, fill: '#3b82f6', drop: 0 },
            { name: 'Checkouts', value: c, fill: '#f59e0b', drop: dropToCheckout },
            { name: 'Vendas', value: s, fill: '#10b981', drop: dropToSale },
        ]
    }, [kpis])

    // Chart Data: Daily Evolution
    const evolutionData = useMemo(() => {
        const days = new Map<string, { date: string, visitors: Set<string>, sales: number }>()

        // Initialize days based on period (optional, but good for gaps)
        // For simplicity, we just aggregate existing data

        pageviews.forEach(p => {
            const date = new Date(p.timestamp).toLocaleDateString('pt-BR')
            if (!days.has(date)) days.set(date, { date, visitors: new Set(), sales: 0 })
            days.get(date)!.visitors.add(p.visitor_id)
        })

        purchases.forEach(p => {
            const date = new Date(p.timestamp).toLocaleDateString('pt-BR')
            if (!days.has(date)) days.set(date, { date, visitors: new Set(), sales: 0 })
            days.get(date)!.sales += 1
        })

        return Array.from(days.values())
            .map(d => ({ ...d, visitors: d.visitors.size }))
            .sort((a, b) => {
                // Simple sort by date string (DD/MM/YYYY) might fail, better to use timestamp keys or ISO
                // Let's re-parse for sort
                const [da, ma, ya] = a.date.split('/')
                const [db, mb, yb] = b.date.split('/')
                return new Date(Number(ya), Number(ma) - 1, Number(da)).getTime() - new Date(Number(yb), Number(mb) - 1, Number(db)).getTime()
            })
    }, [pageviews, purchases])

    // Top Sources
    const topSources = useMemo(() => {
        // Map visitor_id to source from pageviews
        const visitorSources = new Map<string, string>()
        pageviews.forEach(p => {
            if (p.utm_source && !visitorSources.has(p.visitor_id)) {
                visitorSources.set(p.visitor_id, p.utm_source)
            }
        })

        const sources = new Map<string, { count: number, revenue: number }>()

        purchases.forEach(p => {
            const source = visitorSources.get(p.visitor_id) || 'Direto / Desconhecido'
            if (!sources.has(source)) sources.set(source, { count: 0, revenue: 0 })
            const s = sources.get(source)!
            s.count += 1
            s.revenue += p.price_value
        })

        return Array.from(sources.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5)
    }, [pageviews, purchases])

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
            {/* Header & Filters */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
                    <p className="text-gray-500">Visão geral do desempenho do seu negócio.</p>
                </div>
                <div className="flex gap-2">
                    <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Selecione o Site" />
                        </SelectTrigger>
                        <SelectContent>
                            {sites.map(site => (
                                <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={period} onValueChange={setPeriod}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Período" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Hoje</SelectItem>
                            <SelectItem value="7d">Últimos 7 dias</SelectItem>
                            <SelectItem value="30d">Últimos 30 dias</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <KpiCard title="Visitantes Únicos" value={kpis.uniqueVisitors} icon={Users} />
                <KpiCard title="Checkouts Iniciados" value={kpis.uniqueCheckouts} icon={ShoppingCart} />
                <KpiCard title="Vendas Totais" value={kpis.totalSales} icon={CreditCard} />
                <KpiCard title="Receita" value={formatCurrency(kpis.revenue)} icon={DollarSign} />
                <KpiCard title="Taxa de Conversão" value={formatPercent(kpis.conversionRate)} icon={TrendingUp} />
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Funil de Vendas</CardTitle>
                        <CardDescription>Conversão entre etapas</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={funnelData} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={80} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    content={({ payload }) => {
                                        if (!payload || !payload.length) return null
                                        const data = payload[0].payload
                                        return (
                                            <div className="bg-white p-2 border rounded shadow-sm">
                                                <p className="font-bold">{data.name}</p>
                                                <p>{data.value}</p>
                                                {data.drop > 0 && (
                                                    <p className="text-red-500 text-sm flex items-center">
                                                        <ArrowDown className="w-3 h-3 mr-1" />
                                                        {data.drop.toFixed(1)}% perda
                                                    </p>
                                                )}
                                            </div>
                                        )
                                    }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={40} label={{ position: 'right', fill: '#666' }} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Evolução Diária</CardTitle>
                        <CardDescription>Visitantes vs Vendas</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={evolutionData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" />
                                <YAxis yAxisId="left" />
                                <YAxis yAxisId="right" orientation="right" />
                                <Tooltip />
                                <Legend />
                                <Line yAxisId="left" type="monotone" dataKey="visitors" name="Visitantes" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                <Line yAxisId="right" type="monotone" dataKey="sales" name="Vendas" stroke="#10b981" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Tables */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Top Origens</CardTitle>
                        <CardDescription>Por receita gerada</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Origem</TableHead>
                                    <TableHead className="text-right">Vendas</TableHead>
                                    <TableHead className="text-right">Receita</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {topSources.map((source) => (
                                    <TableRow key={source.name}>
                                        <TableCell className="font-medium">{source.name}</TableCell>
                                        <TableCell className="text-right">{source.count}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(source.revenue)}</TableCell>
                                    </TableRow>
                                ))}
                                {topSources.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center text-gray-500">Sem dados</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Últimas Vendas</CardTitle>
                        <CardDescription>Transações recentes</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Produto</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead className="text-right">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {purchases.slice(0, 5).map((purchase) => (
                                    <TableRow key={purchase.id}>
                                        <TableCell>
                                            <div className="font-medium">{purchase.buyer_name || 'Anônimo'}</div>
                                            <div className="text-xs text-gray-500">{purchase.buyer_email}</div>
                                        </TableCell>
                                        <TableCell>{purchase.product_name}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(purchase.price_value)}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant={purchase.status === 'paid' ? 'default' : 'secondary'}>
                                                {purchase.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {purchases.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-gray-500">Sem dados</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

function KpiCard({ title, value, icon: Icon }: { title: string, value: string | number, icon: any }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    {title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
            </CardContent>
        </Card>
    )
}
