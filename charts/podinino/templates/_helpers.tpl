{{/*
Expand the name of the chart.
*/}}
{{- define "podinino.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "podinino.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "podinino.serviceAccountName" -}}
{{- if .Values.rbac.create }}
{{- default (include "podinino.fullname" .) (and .Values.serviceAccount .Values.serviceAccount.name) }}
{{- else }}
{{- default "default" (and .Values.serviceAccount .Values.serviceAccount.name) }}
{{- end }}
{{- end }}
