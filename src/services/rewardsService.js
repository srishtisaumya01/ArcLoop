import { api } from './api/apiClient.js'

// Badges earned and a year of activity. The server awards any badge the streak history has earned each time this is read.
export const getRewards = () => api.get('/rewards/')
