'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Site } from '@/types/supabase'
import { SiteSelector } from '@/components/settings/SiteSelector'
import { PageRulesManager } from '@/components/settings/PageRulesManager'
import { AddSiteDialog } from '@/components/settings/AddSiteDialog'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function ContentSettingsPage() {
    const supabase = createClient()
    const [sites, setSites] = useState<Site[]>([])
    const [selectedSiteId, setSelectedSiteId] = useState<string>('')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchSites()
    }, [])

    const fetchSites = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('sites')
            .select('*')
            .order('name')

        if (error) {
            console.error('Error fetching sites:', error)
        } else {
            setSites(data || [])
            if (data && data.length > 0) {
                setSelectedSiteId(data[0].id)
            }
        }
        setLoading(false)
    }

    return (
        <div className="p-8 space-y-8 max-w-5xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Configuração de Conteúdo</h1>
                <p className="text-gray-500">Gerencie seus sites e classifique suas páginas.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Selecione o Site</CardTitle>
                    <CardDescription>Escolha qual site você deseja configurar as regras de página.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex justify-between items-center gap-4">
                        {loading ? (
                            <p>Carregando sites...</p>
                        ) : sites.length > 0 ? (
                            <SiteSelector
                                sites={sites}
                                selectedSiteId={selectedSiteId}
                                onSelect={setSelectedSiteId}
                            />
                        ) : (
                            <p className="text-muted-foreground">Nenhum site encontrado.</p>
                        )}

                        <AddSiteDialog onSiteAdded={(newSite) => {
                            setSites([...sites, newSite])
                            setSelectedSiteId(newSite.id)
                        }} />
                    </div>
                </CardContent>
            </Card>

            {selectedSiteId && (
                <PageRulesManager siteId={selectedSiteId} />
            )}
        </div>
    )
}
