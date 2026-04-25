import { createSlice } from '@reduxjs/toolkit'

// User shape (matches /api/auth/login response):
// { id, fullName, email, institutionId, institutionName,
//   departmentId, departmentName, profileImageUrl, mustChangePassword,
//   roles: [{ id, name, display_name, permissions }] }

const initialState = {
  user: null,
  token: null,
  isAuthenticated: false,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { user, token } = action.payload
      state.user            = user
      state.token           = token
      state.isAuthenticated = true
    },
    logout: (state) => {
      state.user            = null
      state.token           = null
      state.isAuthenticated = false
    },
  },
})

export const { setCredentials, logout } = authSlice.actions

export const selectCurrentUser     = (state) => state.auth.user
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated
export const selectToken           = (state) => state.auth.token

export default authSlice.reducer
