export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          pinned?: boolean
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      card_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          card_code: string
          card_id: string | null
          created_at: string
          id: string
          note: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          card_code: string
          card_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          card_code?: string
          card_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
        }
        Relationships: []
      }
      card_favorites: {
        Row: {
          card_code: string
          created_at: string
          user_id: string
        }
        Insert: {
          card_code: string
          created_at?: string
          user_id: string
        }
        Update: {
          card_code?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      card_reviews: {
        Row: {
          body: string | null
          card_code: string
          created_at: string
          id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          card_code: string
          created_at?: string
          id?: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          card_code?: string
          created_at?: string
          id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cards: {
        Row: {
          attribute: string | null
          code: string
          colors: string[]
          cost: number | null
          counter: number | null
          created_at: string
          effect: string | null
          game: Database["public"]["Enums"]["tcg_game"]
          id: string
          image_url: string | null
          name: string
          power: number | null
          rarity: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          set_code: string
          status: Database["public"]["Enums"]["card_status"]
          submitted_by: string | null
          type: Database["public"]["Enums"]["card_type"]
          updated_at: string
        }
        Insert: {
          attribute?: string | null
          code: string
          colors?: string[]
          cost?: number | null
          counter?: number | null
          created_at?: string
          effect?: string | null
          game?: Database["public"]["Enums"]["tcg_game"]
          id?: string
          image_url?: string | null
          name: string
          power?: number | null
          rarity?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          set_code: string
          status?: Database["public"]["Enums"]["card_status"]
          submitted_by?: string | null
          type: Database["public"]["Enums"]["card_type"]
          updated_at?: string
        }
        Update: {
          attribute?: string | null
          code?: string
          colors?: string[]
          cost?: number | null
          counter?: number | null
          created_at?: string
          effect?: string | null
          game?: Database["public"]["Enums"]["tcg_game"]
          id?: string
          image_url?: string | null
          name?: string
          power?: number | null
          rarity?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          set_code?: string
          status?: Database["public"]["Enums"]["card_status"]
          submitted_by?: string | null
          type?: Database["public"]["Enums"]["card_type"]
          updated_at?: string
        }
        Relationships: []
      }
      deck_cards: {
        Row: {
          card_code: string
          created_at: string
          deck_id: string
          id: string
          position: number
          quantity: number
        }
        Insert: {
          card_code: string
          created_at?: string
          deck_id: string
          id?: string
          position?: number
          quantity?: number
        }
        Update: {
          card_code?: string
          created_at?: string
          deck_id?: string
          id?: string
          position?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          archetype: string | null
          colors: string[]
          created_at: string
          game: Database["public"]["Enums"]["tcg_game"]
          id: string
          is_public: boolean
          leader: string | null
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archetype?: string | null
          colors?: string[]
          created_at?: string
          game: Database["public"]["Enums"]["tcg_game"]
          id?: string
          is_public?: boolean
          leader?: string | null
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archetype?: string | null
          colors?: string[]
          created_at?: string
          game?: Database["public"]["Enums"]["tcg_game"]
          id?: string
          is_public?: boolean
          leader?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_favorites: {
        Row: {
          created_at: string
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          early_release_at: string | null
          ends_at: string | null
          game: Database["public"]["Enums"]["tcg_game"]
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          location: string | null
          notes: string | null
          product_url: string | null
          starts_at: string
          store_id: string | null
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          early_release_at?: string | null
          ends_at?: string | null
          game: Database["public"]["Enums"]["tcg_game"]
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          location?: string | null
          notes?: string | null
          product_url?: string | null
          starts_at: string
          store_id?: string | null
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          early_release_at?: string | null
          ends_at?: string | null
          game?: Database["public"]["Enums"]["tcg_game"]
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          location?: string | null
          notes?: string | null
          product_url?: string | null
          starts_at?: string
          store_id?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Relationships: []
      }
      lfg_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          post_id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          post_id: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lfg_messages_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "lfg_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      lfg_participants: {
        Row: {
          created_at: string
          id: string
          message: string | null
          post_id: string
          status: Database["public"]["Enums"]["lfg_participant_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          post_id: string
          status?: Database["public"]["Enums"]["lfg_participant_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          post_id?: string
          status?: Database["public"]["Enums"]["lfg_participant_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lfg_participants_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "lfg_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      lfg_posts: {
        Row: {
          body: string | null
          category: Database["public"]["Enums"]["lfg_category"]
          contact: string | null
          created_at: string
          duration_minutes: number | null
          game: Database["public"]["Enums"]["tcg_game"]
          games_count: number | null
          id: string
          kakao_link: string | null
          location: string | null
          meet_at: string | null
          quick_match: boolean
          status: string
          store_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category?: Database["public"]["Enums"]["lfg_category"]
          contact?: string | null
          created_at?: string
          duration_minutes?: number | null
          game: Database["public"]["Enums"]["tcg_game"]
          games_count?: number | null
          id?: string
          kakao_link?: string | null
          location?: string | null
          meet_at?: string | null
          quick_match?: boolean
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: Database["public"]["Enums"]["lfg_category"]
          contact?: string | null
          created_at?: string
          duration_minutes?: number | null
          game?: Database["public"]["Enums"]["tcg_game"]
          games_count?: number | null
          id?: string
          kakao_link?: string | null
          location?: string | null
          meet_at?: string | null
          quick_match?: boolean
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string
          deck_id: string | null
          event: Database["public"]["Enums"]["match_event"]
          game: Database["public"]["Enums"]["tcg_game"]
          id: string
          my_deck: string
          notes: string | null
          opp_deck: string | null
          opp_leader: string | null
          opponent_deck_id: string | null
          opponent_points_delta: number | null
          opponent_pre_rating: number | null
          opponent_user_id: string | null
          played_at: string
          points_delta: number | null
          pre_rating: number | null
          result: Database["public"]["Enums"]["match_result"]
          tournament_note: string | null
          user_id: string
          went_first: boolean
        }
        Insert: {
          created_at?: string
          deck_id?: string | null
          event?: Database["public"]["Enums"]["match_event"]
          game: Database["public"]["Enums"]["tcg_game"]
          id?: string
          my_deck: string
          notes?: string | null
          opp_deck?: string | null
          opp_leader?: string | null
          opponent_deck_id?: string | null
          opponent_points_delta?: number | null
          opponent_pre_rating?: number | null
          opponent_user_id?: string | null
          played_at?: string
          points_delta?: number | null
          pre_rating?: number | null
          result: Database["public"]["Enums"]["match_result"]
          tournament_note?: string | null
          user_id: string
          went_first?: boolean
        }
        Update: {
          created_at?: string
          deck_id?: string | null
          event?: Database["public"]["Enums"]["match_event"]
          game?: Database["public"]["Enums"]["tcg_game"]
          id?: string
          my_deck?: string
          notes?: string | null
          opp_deck?: string | null
          opp_leader?: string | null
          opponent_deck_id?: string | null
          opponent_points_delta?: number | null
          opponent_pre_rating?: number | null
          opponent_user_id?: string | null
          played_at?: string
          points_delta?: number | null
          pre_rating?: number | null
          result?: Database["public"]["Enums"]["match_result"]
          tournament_note?: string | null
          user_id?: string
          went_first?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "matches_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          imp_uid: string | null
          order_id: string
          provider: string
          receipt_url: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          imp_uid?: string | null
          order_id: string
          provider: string
          receipt_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          imp_uid?: string | null
          order_id?: string
          provider?: string
          receipt_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          primary_game: Database["public"]["Enums"]["tcg_game"] | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          primary_game?: Database["public"]["Enums"]["tcg_game"] | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          primary_game?: Database["public"]["Enums"]["tcg_game"] | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      store_favorites: {
        Row: {
          created_at: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          store_id?: string
          user_id?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          address: string | null
          created_at: string
          games: Database["public"]["Enums"]["tcg_game"][]
          id: string
          name: string
          notes: string | null
          phone: string | null
          region: string | null
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          games?: Database["public"]["Enums"]["tcg_game"][]
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          region?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          games?: Database["public"]["Enums"]["tcg_game"][]
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          region?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tier_lists: {
        Row: {
          created_at: string
          game: Database["public"]["Enums"]["tcg_game"]
          id: string
          is_public: boolean
          placements: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game?: Database["public"]["Enums"]["tcg_game"]
          id?: string
          is_public?: boolean
          placements?: Json
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          game?: Database["public"]["Enums"]["tcg_game"]
          id?: string
          is_public?: boolean
          placements?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_collection: {
        Row: {
          card_code: string
          created_at: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          card_code: string
          created_at?: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          card_code?: string
          created_at?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_drive_tokens: {
        Row: {
          access_token: string
          connected_email: string | null
          created_at: string
          expires_at: string
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_email?: string | null
          created_at?: string
          expires_at: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_email?: string | null
          created_at?: string
          expires_at?: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_ratings: {
        Row: {
          game: Database["public"]["Enums"]["tcg_game"]
          matches_count: number
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          game: Database["public"]["Enums"]["tcg_game"]
          matches_count?: number
          rating?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          game?: Database["public"]["Enums"]["tcg_game"]
          matches_count?: number
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      any_admin_exists: { Args: never; Returns: boolean }
      claim_admin_if_none: { Args: never; Returns: boolean }
      get_leaderboard: {
        Args: {
          p_game: Database["public"]["Enums"]["tcg_game"]
          p_limit?: number
          p_min_total?: number
        }
        Returns: {
          avatar_url: string
          display_name: string
          draws: number
          losses: number
          rating: number
          total: number
          user_id: string
          username: string
          win_rate: number
          wins: number
        }[]
      }
      get_user_recent_matches: {
        Args: {
          p_game: Database["public"]["Enums"]["tcg_game"]
          p_limit?: number
          p_user_id: string
        }
        Returns: {
          event: Database["public"]["Enums"]["match_event"]
          game: Database["public"]["Enums"]["tcg_game"]
          id: string
          my_deck: string
          opp_deck: string
          opp_leader: string
          played_at: string
          points_delta: number
          result: Database["public"]["Enums"]["match_result"]
          went_first: boolean
        }[]
      }
      grant_admin_by_email: { Args: { _email: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_announcement_views: {
        Args: { _id: string }
        Returns: undefined
      }
      list_admins: {
        Args: never
        Returns: {
          display_name: string
          email: string
          granted_at: string
          user_id: string
        }[]
      }
      process_successful_payment: {
        Args: {
          p_amount: number
          p_imp_uid?: string
          p_order_id: string
          p_provider: string
          p_user_id: string
        }
        Returns: undefined
      }
      review_card: {
        Args: { _approve: boolean; _code: string; _note?: string }
        Returns: undefined
      }
      revoke_admin_by_email: { Args: { _email: string }; Returns: string }
      search_users: {
        Args: { lim?: number; q: string }
        Returns: {
          avatar_url: string
          display_name: string
          friendship_status: string
          id: string
          primary_game: Database["public"]["Enums"]["tcg_game"]
          username: string
        }[]
      }
      update_opponent_match: {
        Args: {
          _match_id: string
          _opp_deck: string
          _opp_deck_id: string
          _opp_leader: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      card_status: "pending" | "approved" | "rejected"
      card_type: "leader" | "character" | "event" | "stage" | "don"
      event_kind: "tournament" | "release" | "match"
      friendship_status: "pending" | "accepted"
      lfg_category: "friendly" | "tier" | "tournament_practice"
      lfg_participant_status: "pending" | "accepted" | "rejected" | "cancelled"
      match_event: "friendly" | "shop" | "official"
      match_result: "win" | "loss" | "draw"
      tcg_game: "optcg" | "ptcg" | "dtcg"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      card_status: ["pending", "approved", "rejected"],
      card_type: ["leader", "character", "event", "stage", "don"],
      event_kind: ["tournament", "release", "match"],
      friendship_status: ["pending", "accepted"],
      lfg_category: ["friendly", "tier", "tournament_practice"],
      lfg_participant_status: ["pending", "accepted", "rejected", "cancelled"],
      match_event: ["friendly", "shop", "official"],
      match_result: ["win", "loss", "draw"],
      tcg_game: ["optcg", "ptcg", "dtcg"],
    },
  },
} as const
