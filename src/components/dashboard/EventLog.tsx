'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileJson, RefreshCw } from 'lucide-react'

type EventLog = {
    id: string
    table: string
    timestamp: string
    payload: any
}

export function EventLog() {
    const supabase = createClient()
    const [events, setEvents] = useState<EventLog[]>([])
    const [connected, setConnected] = useState(false)

    useEffect(() => {
        const channel = supabase
            .channel('realtime-logs')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'pageviews' },
                (payload) => addEvent('pageviews', payload.new)
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'initiate_checkouts' },
                (payload) => addEvent('initiate_checkouts', payload.new)
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'purchases' },
                (payload) => addEvent('purchases', payload.new)
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') setConnected(true)
                else setConnected(false)
            })

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    const addEvent = (table: string, payload: any) => {
        const newEvent: EventLog = {
            id: payload.id || Math.random().toString(36).substr(2, 9),
            table,
            timestamp: new Date().toISOString(),
            payload,
        }
        setEvents((prev) => [newEvent, ...prev].slice(0, 50)) // Keep last 50 events
    }

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Logs em Tempo Real</CardTitle>
                    <CardDescription>Monitorando novos eventos...</CardDescription>
                </div>
                <Badge variant={connected ? 'default' : 'destructive'}>
                    {connected ? 'Conectado' : 'Desconectado'}
                </Badge>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
                <ScrollArea className="h-[500px]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Hora</TableHead>
                                <TableHead>Tabela</TableHead>
                                <TableHead>Detalhes</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {events.map((event) => (
                                <TableRow key={event.id}>
                                    <TableCell className="font-mono text-xs">
                                        {new Date(event.timestamp).toLocaleTimeString()}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{event.table}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="sm">
                                                    <FileJson className="h-4 w-4 mr-2" />
                                                    Payload
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                                                <DialogHeader>
                                                    <DialogTitle>Payload do Evento ({event.table})</DialogTitle>
                                                </DialogHeader>
                                                <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto text-sm">
                                                    {JSON.stringify(event.payload, null, 2)}
                                                </pre>
                                            </DialogContent>
                                        </Dialog>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {events.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                        Aguardando eventos...
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
        </Card>
    )
}
