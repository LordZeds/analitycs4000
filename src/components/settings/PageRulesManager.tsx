'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { SitePage } from '@/types/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Trash2, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
// import { useToast } from '@/hooks/use-toast'

export function PageRulesManager({ siteId }: { siteId: string }) {
    const supabase = createClient()
    const [rules, setRules] = useState<SitePage[]>([])
    const [loading, setLoading] = useState(true)
    const [newPath, setNewPath] = useState('')
    const [newType, setNewType] = useState<'sales_page' | 'normal_page'>('normal_page')
    const [adding, setAdding] = useState(false)

    useEffect(() => {
        if (siteId) {
            fetchRules()
        }
    }, [siteId])

    const fetchRules = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('site_pages')
            .select('*')
            .eq('site_id', siteId)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching rules:', error)
        } else {
            setRules(data || [])
        }
        setLoading(false)
    }

    const handleAddRule = async () => {
        if (!newPath) return
        if (!newPath.startsWith('/')) {
            alert('O caminho deve começar com /')
            return
        }

        setAdding(true)
        const { data, error } = await supabase
            .from('site_pages')
            .insert({
                site_id: siteId,
                path: newPath,
                page_type: newType,
            })
            .select()
            .single()

        if (error) {
            console.error('Error adding rule:', JSON.stringify(error, null, 2))
            alert(`Erro ao adicionar regra: ${error.message || 'Erro desconhecido'}`)
        } else if (data) {
            setRules([data, ...rules])
            setNewType('normal_page')
        }
        setAdding(false)
    }

    const handleDeleteRule = async (id: string) => {
        const { error } = await supabase
            .from('site_pages')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Error deleting rule:', error)
            alert('Erro ao deletar regra.')
        } else {
            setRules(rules.filter((r) => r.id !== id))
        }
    }

    if (!siteId) return null

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Adicionar Nova Regra</CardTitle>
                    <CardDescription>Classifique as URLs do seu site.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4 items-end">
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                            <label htmlFor="path" className="text-sm font-medium">Caminho (Path)</label>
                            <Input
                                id="path"
                                placeholder="/minha-oferta"
                                value={newPath}
                                onChange={(e) => setNewPath(e.target.value)}
                            />
                        </div>
                        <div className="grid w-full max-w-[200px] items-center gap-1.5">
                            <label className="text-sm font-medium">Tipo de Página</label>
                            <Select value={newType} onValueChange={(val: any) => setNewType(val)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="normal_page">Página Normal</SelectItem>
                                    <SelectItem value="sales_page">Página de Vendas</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleAddRule} disabled={adding}>
                            {adding ? 'Adicionando...' : <><Plus className="mr-2 h-4 w-4" /> Adicionar</>}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Regras Cadastradas</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Caminho</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead className="w-[100px]">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center">Carregando...</TableCell>
                                </TableRow>
                            ) : rules.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center text-muted-foreground">Nenhuma regra cadastrada.</TableCell>
                                </TableRow>
                            ) : (
                                rules.map((rule) => (
                                    <TableRow key={rule.id}>
                                        <TableCell className="font-mono">{rule.path}</TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${rule.page_type === 'sales_page'
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                                                }`}>
                                                {rule.page_type === 'sales_page' ? 'Página de Vendas' : 'Página Normal'}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDeleteRule(rule.id)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
